/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { watch, FSWatcher } from "chokidar"
import { parse, basename, resolve } from "path"
import { pathToCacheContext } from "./cache"
import { GardenModule } from "./types/module"
import { Garden } from "./garden"
import { LogEntry } from "./logger/log-entry"
import { sleep } from "./util/util"
import { some } from "lodash"
import { isConfigFilename, matchPath } from "./util/fs"
import Bluebird from "bluebird"
import { InternalError } from "./exceptions"
import { EventEmitter } from "events"
import { Action } from "./actions/types"

// How long we wait between processing added files and directories
const DEFAULT_BUFFER_INTERVAL = 1250

export type ChangeHandler = (module: GardenModule | null, configChanged: boolean) => Promise<void>

type ChangeType = "added" | "changed" | "removed"

interface ChangedPath {
  type: "dir" | "file"
  path: string
  change: ChangeType
}

let watcher: FSWatcher | undefined

/**
 * Wrapper around the Chokidar file watcher. Emits events on `garden.events` when project files are changed.
 * This needs to be enabled by calling the `.start()` method, and stopped with the `.stop()` method.
 */
export class Watcher extends EventEmitter {
  private garden: Garden
  private log: LogEntry
  private paths: string[]
  private skipPaths: string[]
  private actions: Action[]
  private bufferInterval: number = DEFAULT_BUFFER_INTERVAL
  private watcher?: FSWatcher
  private buffer: { [path: string]: ChangedPath }
  private running: boolean
  public ready: boolean
  public processing: boolean

  constructor({
    garden,
    log,
    paths,
    actions,
    skipPaths,
    bufferInterval,
  }: {
    garden: Garden
    log: LogEntry
    paths: string[]
    actions: Action[]
    skipPaths?: string[]
    bufferInterval?: number
  }) {
    super()
    this.garden = garden
    this.log = log
    this.paths = paths
    this.actions = actions
    this.skipPaths = skipPaths || []
    this.bufferInterval = bufferInterval || DEFAULT_BUFFER_INTERVAL
    this.buffer = {}
    this.running = false
    this.ready = false
    this.processing = false
    this.start()
  }

  async stop() {
    this.running = false

    if (this.watcher) {
      this.log.debug("Watcher: Clearing handlers")
      this.watcher.removeAllListeners()
      // We re-use the FSWatcher instance on Mac to avoid fsevents segfaults, but don't need to on other platforms
      if (process.platform !== "darwin") {
        await this.watcher.close()
      }
      delete this.watcher
    }
  }

  start() {
    this.log.debug(`Watcher: Watching paths ${this.paths.join(", ")}`)

    this.running = true

    if (!this.watcher) {
      // Collect all the configured excludes and pass to the watcher.
      // This allows chokidar to optimize polling based on the exclusions.
      // See https://github.com/garden-io/garden/issues/1269.
      // TODO: see if we can extract paths from dotignore files as well (we'd have to deal with negations etc. somehow).
      const projectExcludes = this.garden.moduleExcludePatterns.map((p) => resolve(this.garden.projectRoot, p))
      const ignored = [...projectExcludes, ...this.skipPaths]
      // TODO: filter paths based on module excludes as well
      //       (requires more complex logic to handle overlapping module sources).
      // const moduleExcludes = flatten(this.actions.map((m) => (m.exclude || []).map((p) => resolve(m.path, p))))

      // We keep a single instance of FSWatcher to avoid segfault issues on Mac
      if (watcher) {
        this.log.debug("Watcher: Using existing FSWatcher")
        this.watcher = watcher

        this.log.debug(`Watcher: Ignoring paths ${ignored.join(", ")}`)
        watcher.unwatch(ignored)

        this.log.debug(`Watcher: Watch ${this.paths}`)
        watcher.add(this.paths)

        this.ready = true

        // Emit after the call returns
        setTimeout(() => {
          watcher!.emit("ready")
        }, 100)
      } else {
        // Make sure that fsevents works when we're on macOS. This has come up before without us noticing, which has
        // a dramatic performance impact, so it's best if we simply throw here so that our tests catch such issues.
        if (process.platform === "darwin") {
          try {
            require("fsevents")
          } catch (error) {
            throw new InternalError(`Unable to load fsevents module: ${error}`, {
              error,
            })
          }
        }

        this.log.debug("Watcher: Starting FSWatcher")
        this.watcher = watch(this.paths, {
          ignoreInitial: true,
          ignorePermissionErrors: true,
          persistent: true,
          awaitWriteFinish: {
            stabilityThreshold: 300,
            pollInterval: 100,
          },
          ignored,
        })

        if (process.platform === "darwin") {
          // We re-use the FSWatcher instance on Mac to avoid fsevents segfaults, but don't need to on other platforms
          watcher = this.watcher
        }
      }

      this.watcher
        .on("add", this.makeFileAddedHandler())
        .on("change", this.makeFileChangedHandler())
        .on("unlink", this.makeFileRemovedHandler())
        .on("addDir", this.makeDirAddedHandler())
        .on("unlinkDir", this.makeDirRemovedHandler())
        .on("ready", () => {
          this.emit("ready")
          this.ready = true
        })
        .on("error", (err) => {
          this.emit("error", err)
        })
        .on("all", (name, path, payload) => {
          this.emit(name, path, payload)
          this.log.silly(`FSWatcher event: ${name} ${path} ${JSON.stringify(payload)}`)
        })
    }

    this.processBuffer().catch((err: Error) => {
      // Log error and restart loop
      this.processing = false
      this.watcher?.emit("error", err)
      this.start()
    })
  }

  private async processBuffer() {
    while (this.running) {
      this.processing = false
      await sleep(this.bufferInterval)
      this.processing = true

      const allChanged = Object.values(this.buffer)
      this.buffer = {}

      if (allChanged.length === 0) {
        continue
      }

      const added = allChanged.filter((c) => c.change === "added")
      const removed = allChanged.filter((c) => c.change === "removed")

      this.log.silly(`Watcher: Processing ${added.length} added and ${removed.length} removed path(s)`)

      // These three checks all emit the appropriate events and then return true if configuration is affected.
      // If configuration is affected, there is no need to proceed because that will trigger a full reload of the
      // Garden instance.

      // Check if any added file is a config file
      if (this.checkForAddedConfig(added)) {
        continue
      }

      // Check if any config file or module dir was removed
      if (this.checkForRemovedConfig(removed)) {
        continue
      }

      // Check if any directories containing config files were added
      if (await this.checkForAddedDirWithConfig(added)) {
        continue
      }

      // First filter actions by path prefix, and include/exclude filters if applicable
      const applicableactions = this.actions.filter((m) => some(allChanged, (p) => {
          const { include, exclude } = m.getConfig()
          return (
            p.path.startsWith(m.basePath()) &&
            (isConfigFilename(basename(p.path)) || matchPath(p.path, include, exclude))
          )
        }))

      // No need to proceed if no actions are affected
      if (applicableactions.length === 0) {
        this.log.silly(`Watcher: No applicable actions for ${allChanged.length} changed path(s)`)
        continue
      }

      this.log.silly(`Watcher: ${applicableactions.length} applicable actions for ${allChanged.length} changed path(s)`)

      // Match removed files against current file lists
      removed.length > 0 && this.sourcesChanged(removed)

      // If some actions still apply, update their file lists and match added files against those
      this.invalidateCached(this.actions)
      await this.updateactions()

      added.length > 0 && this.sourcesChanged(added)
    }

    this.processing = false
  }

  private checkForAddedConfig(added: ChangedPath[]) {
    for (const p of added) {
      if (isConfigFilename(basename(p.path))) {
        this.invalidateCached(this.actions)
        this.garden.events.emit("configAdded", { path: p.path })
        return true
      }
    }

    return false
  }

  private checkForRemovedConfig(removed: ChangedPath[]) {
    for (const p of removed) {
      // Check if project config was removed
      const { dir, base } = parse(p.path)
      if (dir === this.garden.projectRoot && isConfigFilename(base)) {
        this.garden.events.emit("projectConfigChanged", {})
        return true
      }

      // Check if any action directory was removed
      for (const action of this.actions) {
        if (p.type === "dir" && action.basePath().startsWith(p.path)) {
          // at least one module's root dir was removed
          this.invalidateCached(this.actions)
          this.garden.events.emit("actionRemoved", {})
          return true
        }
      }
    }

    return false
  }

  private async checkForAddedDirWithConfig(added: ChangedPath[]) {
    let dirWithConfigAdded = false

    const directoryPaths = added.filter((a) => a.type === "dir").map((a) => a.path)

    if (directoryPaths.length > 0) {
      // Check added directories for new config files
      await Bluebird.map(directoryPaths, async (path) => {
        const configPaths = await this.garden.scanForConfigs(path)

        if (configPaths.length > 0) {
          // The added dir contains one or more garden.yml files
          this.invalidateCached(this.actions)
          for (const configPath of configPaths) {
            this.garden.events.emit("configAdded", { path: configPath })
          }
          dirWithConfigAdded = true
        }
      })
    }

    return dirWithConfigAdded
  }

  private async updateactions() {
    this.log.silly("Watcher: Updating list of actions")
    const graph = await this.garden.getConfigGraph({ log: this.log, emit: false })
    this.actions = graph.getActions()
  }

  private matchActions(paths: ChangedPath[]) {
    return this.actions.filter((a) =>
      some(
        paths,
        (p) =>
          a.configPath() === p.path ||
          (p.type === "file" && a.getFullVersion().files.includes(p.path)) ||
          (p.type === "dir" && p.path.startsWith(a.basePath()))
      )
    )
  }

  private makeFileAddedHandler() {
    return (path: string) => {
      this.buffer[path] = { type: "file", path, change: "added" }
      this.log.silly(`Watcher: File ${path} added`)
    }
  }

  private makeFileRemovedHandler() {
    return (path: string) => {
      this.buffer[path] = { type: "file", path, change: "removed" }
      this.log.silly(`Watcher: File ${path} removed`)
    }
  }

  private makeFileChangedHandler() {
    return (path: string) => {
      this.log.silly(`Watcher: File ${path} modified`)
      this.sourcesChanged([{ type: "file", path, change: "changed" }])
    }
  }

  private makeDirAddedHandler() {
    return (path: string) => {
      this.buffer[path] = { type: "dir", path, change: "added" }
      this.log.silly(`Watcher: Directory ${path} added to buffer`)
    }
  }

  private makeDirRemovedHandler() {
    return (path: string) => {
      this.buffer[path] = { type: "dir", path, change: "removed" }
      this.log.silly(`Watcher: Directory ${path} removed`)
    }
  }

  private sourcesChanged(paths: ChangedPath[]) {
    const changedActions = this.matchActions(paths)

    this.log.silly(`Matched ${changedActions.length} actions`)

    for (const { path, change } of paths) {
      const parsed = parse(path)
      const filename = parsed.base

      const isIgnoreFile = this.garden.dotIgnoreFile === filename

      if (isIgnoreFile) {
        // TODO: check to see if the project structure actually changed after the ignore file change
        this.invalidateCached(this.actions)
        this.garden.events.emit("projectConfigChanged", {})

        // No need to emit other events if config changed
        return
      }

      if (isConfigFilename(filename)) {
        this.log.silly(`Config file ${path} ${change}`)
        this.invalidateCached(this.actions)

        if (change === "changed") {
          const changedActionConfigs = changedActions.filter((a) => a.configPath() === path)

          if (changedActionConfigs.length > 0) {
            const names = changedActionConfigs.map((m) => m.name)
            this.garden.events.emit("actionConfigChanged", { names, path })
          } else if (parsed.dir === this.garden.projectRoot) {
            this.garden.events.emit("projectConfigChanged", {})
          }
        } else if (change === "added") {
          this.garden.events.emit("configAdded", { path })
        } else if (change === "removed") {
          this.garden.events.emit("configRemoved", { path })
        }

        // No need to emit other events if config changed
        return
      }
    }

    if (changedActions.length > 0) {
      const refs = changedActions.map((m) => m.reference())
      this.invalidateCached(changedActions)
      this.garden.events.emit("actionSourcesChanged", {
        refs,
        pathsChanged: paths.map((p) => p.path),
      })
    }
  }

  private invalidateCached(actions: Action[]) {
    // invalidate the cache for anything attached to the module path or upwards in the directory tree
    for (const action of actions) {
      const cacheContext = pathToCacheContext(action.basePath())
      this.garden.cache.invalidateUp(this.log, cacheContext)
    }
  }
}
