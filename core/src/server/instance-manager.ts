/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import Bluebird from "bluebird"
import chalk from "chalk"
import { Autocompleter, AutocompleteSuggestion } from "../cli/autocomplete"
import { CloudApi, CloudApiFactoryParams } from "../cloud/api"
import type { Command } from "../commands/base"
import { getBuiltinCommands, flattenCommands } from "../commands/commands"
import { getCustomCommands } from "../commands/custom"
import { ServeCommand } from "../commands/serve"
import { EventBus, GardenEventAnyListener } from "../events"
import { ConfigDump, Garden, GardenOpts } from "../garden"
import type { Log } from "../logger/log-entry"
import { MonitorManager } from "../monitors/manager"
import { environmentToString } from "../types/namespace"
import { AutocompleteCommand, ReloadCommand, LogLevelCommand, HideCommand } from "./commands"
import { getGardenInstanceKey, GardenInstanceKeyParams } from "./helpers"

interface InstanceContext {
  garden: Garden
  listener: GardenEventAnyListener
}

interface ProjectRootContext {
  commands: Command[]
  autocompleter: Autocompleter
  configDump?: ConfigDump
}

interface GardenInstanceManagerParams {
  log: Log
  sessionId: string
  serveCommand?: ServeCommand
  extraCommands?: Command[]
  defaultOpts?: Partial<GardenOpts>
}

// TODO: clean up unused instances after some timeout since last request and when no monitors are active

let _manager: GardenInstanceManager | undefined

export class GardenInstanceManager {
  public readonly sessionId: string

  private instances: Map<string, InstanceContext>
  private projectRoots: Map<string, ProjectRootContext>
  private cloudApis: Map<string, CloudApi>
  private lastRequested: Map<string, Date>
  private lock: AsyncLock
  private builtinCommands: Command[]
  public readonly monitors: MonitorManager
  private defaultOpts: Partial<GardenOpts> // Used for testing
  public readonly serveCommand: ServeCommand

  /**
   * Events from every managed Garden instance are piped to this EventBus. Each event emitted implicitly includes
   * a `gardenKey` property with the instance key and a `sessionId`.
   */
  public events: EventBus

  public defaultProjectRoot?: string
  public defaultEnv?: string

  private constructor({ log, sessionId, serveCommand, extraCommands, defaultOpts }: GardenInstanceManagerParams) {
    this.sessionId = sessionId
    this.instances = new Map()
    this.projectRoots = new Map()
    this.cloudApis = new Map()
    this.lastRequested = new Map()
    this.defaultOpts = defaultOpts || {}

    this.events = new EventBus()
    this.monitors = new MonitorManager(log, this.events)
    this.lock = new AsyncLock()

    this.builtinCommands = [
      ...getBuiltinCommands(),
      ...flattenCommands([
        new AutocompleteCommand(this),
        new ReloadCommand(serveCommand),
        new LogLevelCommand(),
        new HideCommand(),
      ]),
      ...(extraCommands || []),
    ]
  }

  static getInstance(params: GardenInstanceManagerParams & { force?: boolean }) {
    if (!_manager || params.force) {
      _manager = new GardenInstanceManager(params)
    }
    return _manager
  }

  getKey(params: GardenInstanceKeyParams): string {
    return getGardenInstanceKey(params)
  }

  async ensureInstance(log: Log, params: GardenInstanceKeyParams, opts: GardenOpts) {
    const key = this.getKey(params)
    this.lastRequested.set(key, new Date())

    return this.lock.acquire(key, async () => {
      const instance = this.instances.get(key)
      let garden = instance?.garden

      if (!garden || garden.needsReload() || opts.forceRefresh) {
        const envStr = environmentToString(params)

        const reason = !garden
          ? "none found for key"
          : garden.needsReload()
          ? "flagged for reload"
          : "forceRefresh=true"

        log.verbose(`Initializing Garden context for ${envStr} (${reason})`)
        log.debug(`Instance key: ${key}`)

        garden = await Garden.factory(params.projectRoot, {
          // The sessionId should be the same as the surrounding process.
          // For each command run, this will be set as the parentSessionId,
          // and the command-specific Garden (cloned in `Command.run()`) gets its own sessionId.
          sessionId: this.sessionId,
          monitors: this.monitors,
          ...this.defaultOpts,
          ...garden?.opts,
          ...opts,
          ...params,
        })
        this.set(log, garden)

        const rootContext = this.projectRoots.get(params.projectRoot)

        if (opts.forceRefresh || !rootContext || !rootContext.configDump) {
          const configDump = await garden.dumpConfig({ log, partial: true })
          await this.updateProjectRootContext(log, params.projectRoot, configDump)
        }
      }

      return garden
    })
  }

  async getCloudApi(params: CloudApiFactoryParams) {
    const { cloudDomain } = params
    let api = this.cloudApis.get(cloudDomain)

    if (!api) {
      api = await CloudApi.factory(params)
      api && this.cloudApis.set(cloudDomain, api)
    }

    return api
  }

  // TODO: allow clearing a specific context
  async clear() {
    const instances = this.instances.values()

    await Bluebird.map(instances, async ({ garden }) => {
      garden.close()
    })

    this.instances.clear()
    this.projectRoots.clear()
  }

  async reload(log: Log) {
    const projectRoots = this.projectRoots.keys()

    // Clear existing instances that have no monitors running
    await this.clear()

    // Reload context for each project root
    await Bluebird.map(projectRoots, async (projectRoot) => {
      await this.updateProjectRootContext(log, projectRoot)
    })
  }

  set(log: Log, garden: Garden) {
    const key = garden.getInstanceKey()
    const existing = this.instances.get(key)

    // Flag the instance for reloading when configs change
    garden.events.once("configChanged", (_payload) => {
      if (!garden.needsReload) {
        garden.needsReload(true)
        garden.log.info(
          chalk.magenta.bold(
            `${chalk.white("→")} Config change detected. Project will be reloaded when the next command is run.`
          )
        )
      }
    })

    // Make sure file watching is started and updated after config file scans
    garden.events.once("configsScanned", (_) => {
      garden.watchPaths()
    })

    const listener =
      existing?.listener ||
      ((name, payload) => {
        this.events.emit(name, payload)
      })
    if (existing?.garden) {
      existing.garden.events.offAny(listener)
    }
    garden.events.ensureAny(listener)

    this.instances.set(key, { garden, listener })
    log.debug(`Garden context updated for key ${key}`)
  }

  getAll(): Garden[] {
    return Array.from(this.instances.values()).map(({ garden }) => garden)
  }

  getCommands(log: Log, projectRoot?: string) {
    const { commands } = this.getProjectRootContext(log, projectRoot)
    return commands
  }

  getAutocompleteSuggestions({
    log,
    projectRoot,
    input,
    ignoreGlobalFlags = true,
  }: {
    log: Log
    projectRoot?: string
    input: string
    ignoreGlobalFlags?: boolean
  }): AutocompleteSuggestion[] {
    const { autocompleter } = this.getProjectRootContext(log, projectRoot)
    // TODO: make the opts configurable
    return autocompleter.getSuggestions(input, { limit: 100, ignoreGlobalFlags })
  }

  async ensureProjectRootContext(log: Log, projectRoot: string) {
    return this.projectRoots.get(projectRoot) || this.updateProjectRootContext(log, projectRoot)
  }

  private getProjectRootContext(log: Log, projectRoot?: string) {
    if (!projectRoot || !this.projectRoots.get(projectRoot)) {
      const commands = this.builtinCommands

      return {
        commands,
        autocompleter: new Autocompleter({ log, commands, configDump: undefined }),
      }
    }

    return this.projectRoots.get(projectRoot)!
  }

  async updateProjectRootContext(log: Log, projectRoot: string, configDump?: ConfigDump) {
    const customCommands = await getCustomCommands(log, projectRoot)
    const commands = [...this.builtinCommands, ...customCommands]
    const context: ProjectRootContext = {
      commands,
      autocompleter: new Autocompleter({ log, commands, configDump }),
    }
    this.projectRoots.set(projectRoot, context)
    return context
  }
}
