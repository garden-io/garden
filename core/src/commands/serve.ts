/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandResult, CommandParams } from "./base.js"
import { Command } from "./base.js"
import { startServer } from "../server/server.js"
import { IntegerParameter, StringsParameter } from "../cli/params.js"
import { printEmoji, printHeader } from "../logger/util.js"
import { dedent } from "../util/string.js"
import type { CommandLine } from "../cli/command-line.js"
import { GardenInstanceManager } from "../server/instance-manager.js"
import { sleep } from "../util/util.js"
import type { Log } from "../logger/log-entry.js"
import { findProjectConfig } from "../config/base.js"
import { CloudApiTokenRefreshError } from "../cloud/api.js"
import { uuidv4 } from "../util/random.js"
import type { Garden } from "../garden.js"
import type { GardenPluginReference } from "../plugin/plugin.js"
import { CommandError, ParameterError, isEAddrInUseException, isErrnoException } from "../exceptions.js"
import { styles } from "../logger/styles.js"
import { getCloudDistributionName } from "../cloud/util.js"
import { reportDeprecatedFeatureUsage } from "../util/deprecations.js"

export const defaultServerPort = 9777

export const serveArgs = {}

export const serveOpts = {
  port: new IntegerParameter({
    help: `The port number for the server to listen on (defaults to ${defaultServerPort} if available).`,
  }),
  cmd: new StringsParameter({ help: "(Only used by dev command for now)", hidden: true }),
}

export type ServeCommandArgs = typeof serveArgs
export type ServeCommandOpts = typeof serveOpts

export class ServeCommand<
  A extends ServeCommandArgs = ServeCommandArgs,
  O extends ServeCommandOpts = ServeCommandOpts,
  R = any,
> extends Command<A, O, R> {
  name = "serve"
  help = "Starts the Garden Core API server for the current project and environment."

  override cliOnly = true
  override streamEvents = true
  override hidden = true
  override noProject = true

  protected _manager?: GardenInstanceManager
  protected commandLine?: CommandLine
  protected sessionId?: string
  protected plugins?: GardenPluginReference[]

  override description = dedent`
    Starts the Garden Core API server for the current project, and your selected environment+namespace.

    Note: You must currently run one server per environment and namespace.
  `

  override arguments = <A>serveArgs
  override options = <O>serveOpts

  override printHeader({ log }) {
    printHeader(log, "Garden API Server", "🌐")
  }

  override terminate() {
    super.terminate()
    this.server?.close().catch(() => {})
  }

  override maybePersistent() {
    return true
  }

  override allowInDevCommand() {
    return false
  }

  protected setProps(sessionId: string, plugins: GardenPluginReference[]) {
    this.sessionId = sessionId
    this.plugins = plugins
  }

  async action({
    garden,
    log,
    opts,
    cli,
  }: CommandParams<ServeCommandArgs, ServeCommandOpts>): Promise<CommandResult<R>> {
    const sessionId = garden.sessionId
    this.setProps(sessionId, cli?.plugins || [])

    if (opts["local-mode"] !== undefined) {
      reportDeprecatedFeatureUsage({
        apiVersion: garden.projectApiVersion,
        log,
        deprecation: "localMode",
      })
    }

    const projectConfig = await findProjectConfig({ log, path: garden.projectRoot })

    const manager = this.getManager(log, undefined)
    manager.defaultProjectRoot = projectConfig?.path || process.cwd()
    manager.defaultEnv = opts.env

    let defaultGarden: Garden | undefined
    if (projectConfig) {
      // Try loading the default Garden instance based on found project config, to populate autocompleter etc.
      try {
        defaultGarden = await manager.getGardenForRequest({
          projectConfig,
          globalConfigStore: garden.globalConfigStore,
          log,
          args: {},
          opts: {},
          sessionId,
          environmentString: opts.env,
        })
        if (this.commandLine) {
          this.commandLine.cwd = defaultGarden.projectRoot
        }
      } catch (error) {
        log.warn(`Unable to load Garden project found at ${projectConfig.path}: ${error}`)
      }
    }

    try {
      this.server = await startServer({
        log,
        manager,
        port: opts.port,
        defaultProjectRoot: manager.defaultProjectRoot || process.cwd(),
        serveCommand: this,
      })
    } catch (err) {
      if (isEAddrInUseException(err)) {
        throw new ParameterError({
          message: dedent`
            Port ${opts.port} is already in use, possibly by another Garden server process.
            Either terminate the other process, or choose another port using the --port parameter.
          `,
        })
      } else if (isErrnoException(err)) {
        throw new CommandError({
          message: `Unable to start server: ${err.message}`,
          code: err.code,
        })
      }

      throw err
    }

    if (defaultGarden && defaultGarden.isOldBackendAvailable()) {
      const cloudApi = defaultGarden.cloudApi
      const effectiveGardenProjectConfig = defaultGarden.getProjectConfig()

      let projectId = effectiveGardenProjectConfig.id
      try {
        if (!projectId) {
          const cloudProject = await cloudApi.getProjectByName(effectiveGardenProjectConfig.name)
          projectId = cloudProject?.id
        }

        if (projectId) {
          const session = await cloudApi.registerSession({
            parentSessionId: undefined,
            projectId,
            // Use the process (i.e. parent command) session ID for the serve/dev command session
            sessionId: manager.sessionId,
            commandInfo: garden.commandInfo,
            localServerPort: this.server.port,
            environment: defaultGarden.environmentName,
            namespace: defaultGarden.namespace,
            isDevCommand: true,
          })
          if (session?.shortId) {
            const distroName = getCloudDistributionName(defaultGarden.cloudDomain)
            const livePageUrl = cloudApi.getLivePageUrl({ shortId: session.shortId }).toString()
            const msg = dedent`\n${printEmoji("🌸", log)}Connected to ${distroName} ${printEmoji("🌸", log)}

              Follow the link below to stream logs, run commands, and more from the Garden dashboard ${printEmoji(
                "👇",
                log
              )} \n\n${styles.highlight(livePageUrl)}\n`
            log.info(msg)
          }
        }
      } catch (err) {
        if (err instanceof CloudApiTokenRefreshError) {
          const distroName = getCloudDistributionName(defaultGarden.cloudDomain)
          log.warn(dedent`
          Unable to authenticate against ${distroName} with the current session token.
          The dashboard will not be available until you authenticate again. Please try logging out with
          ${styles.command("garden logout")} and back in again with ${styles.command("garden login")}.
        `)
        } else {
          // Unhandled error when creating the cloud api
          throw err
        }
      }
    }

    return new Promise((resolve, reject) => {
      this.server!.on("close", () => {
        resolve({})
      })

      this.server!.on("error", (err: unknown) => {
        reject(err)
      })

      // Errors are handled in the method
      this.reload(log)
        .then(async () => {
          if (this.commandLine) {
            for (const cmd of opts.cmd || []) {
              await this.commandLine.typeCommand(cmd)
              await sleep(1000)
            }
          }
          this.commandLine?.flashSuccess(styles.accent.bold(`Dev console is ready to go! 🚀`))
          this.commandLine?.enable()
        })
        // Errors are handled in the method
        .catch(() => {})
    })
  }

  getManager(log: Log, initialSessionId: string | undefined): GardenInstanceManager {
    if (!this._manager) {
      this._manager = GardenInstanceManager.getInstance({
        log,
        sessionId: this.sessionId || initialSessionId || uuidv4(),
        serveCommand: this,
        plugins: this.plugins || [],
      })
    }

    return this._manager
  }

  async reload(log: Log) {
    await this.getManager(log, undefined).reload(log)
  }
}
