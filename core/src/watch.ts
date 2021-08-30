/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
  private watcher?: FSWatcher
  private buffer: { [path: string]: ChangedPath }
  private running: boolean
  public processing: boolean

  constructor(
    private garden: Garden,
    private log: LogEntry,
    private paths: string[],
    private modules: GardenModule[],
    private bufferInterval: number = DEFAULT_BUFFER_INTERVAL
  ) {
    super()
    this.buffer = {}
    this.running = false
    this.processing = false
    this.start()
  }

  async stop() {
    this.running = false

    if (this.watcher) {
      this.log.debug(`Watcher: Clearing handlers`)
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
      const ignored = [...projectExcludes]
      // TODO: filter paths based on module excludes as well
      //       (requires more complex logic to handle overlapping module sources).
      // const moduleExcludes = flatten(this.modules.map((m) => (m.exclude || []).map((p) => resolve(m.path, p))))

      // We keep a single instance of FSWatcher to avoid segfault issues on Mac
      if (watcher) {
        this.log.debug(`Watcher: Using existing FSWatcher`)
        this.watcher = watcher

        this.log.debug(`Watcher: Ignore ${ignored.join(", ")}`)
        watcher.unwatch(ignored)

        this.log.debug(`Watcher: Watch ${this.paths}`)
        watcher.add(this.paths)
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

        this.log.debug(`Watcher: Starting FSWatcher`)
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

      // First filter modules by path prefix, and include/exclude filters if applicable
      const applicableModules = this.modules.filter((m) => {
        return some(allChanged, (p) => {
          return (
            p.path.startsWith(m.path) && (isConfigFilename(basename(p.path)) || matchPath(p.path, m.include, m.exclude))
          )
        })
      })

      // No need to proceed if no modules are affected
      if (applicableModules.length === 0) {
        this.log.silly(`Watcher: No applicable modules for ${allChanged.length} changed path(s)`)
        continue
      }

      this.log.silly(`Watcher: ${applicableModules.length} applicable modules for ${allChanged.length} changed path(s)`)

      // Match removed files against current file lists
      removed.length > 0 && this.sourcesChanged(removed)

      // If some modules still apply, update their file lists and match added files against those
      this.invalidateCached(this.modules)
      await this.updateModules()

      added.length > 0 && this.sourcesChanged(added)
    }

    this.processing = false
  }

  private checkForAddedConfig(added: ChangedPath[]) {
    for (const p of added) {
      if (isConfigFilename(basename(p.path))) {
        this.invalidateCached(this.modules)
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

      // Check if any module directory was removed
      for (const module of this.modules) {
        if (p.type === "dir" && module.path.startsWith(p.path)) {
          // at least one module's root dir was removed
          this.invalidateCached(this.modules)
          this.garden.events.emit("moduleRemoved", {})
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
          this.invalidateCached(this.modules)
          for (const configPath of configPaths) {
            this.garden.events.emit("configAdded", { path: configPath })
          }
          dirWithConfigAdded = true
        }
      })
    }

    return dirWithConfigAdded
  }

  private async updateModules() {
    this.log.silly(`Watcher: Updating list of modules`)
    const graph = await this.garden.getConfigGraph(this.log)
    this.modules = graph.getModules()
  }

  private matchModules(paths: ChangedPath[]) {
    return this.modules.filter((m) =>
      some(
        paths,
        (p) =>
          m.configPath === p.path ||
          (p.type === "file" && m.version.files.includes(p.path)) ||
          (p.type === "dir" && p.path.startsWith(m.path))
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
    const changedModules = this.matchModules(paths)

    this.log.silly(`Matched ${changedModules.length} modules`)

    for (const { path, change } of paths) {
      const parsed = parse(path)
      const filename = parsed.base

      const isIgnoreFile = this.garden.dotIgnoreFiles.includes(filename)

      if (isIgnoreFile) {
        // TODO: check to see if the project structure actually changed after the ignore file change
        this.invalidateCached(this.modules)
        this.garden.events.emit("projectConfigChanged", {})

        // No need to emit other events if config changed
        return
      }

      if (isConfigFilename(filename)) {
        this.log.silly(`Config file ${path} ${change}`)
        this.invalidateCached(this.modules)

        if (change === "changed") {
          const changedModuleConfigs = changedModules.filter((m) => m.configPath === path)

          if (changedModuleConfigs.length > 0) {
            const names = changedModuleConfigs.map((m) => m.name)
            this.garden.events.emit("moduleConfigChanged", { names, path })
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

    if (changedModules.length > 0) {
      const names = changedModules.map((m) => m.name)
      this.invalidateCached(changedModules)
      this.garden.events.emit("moduleSourcesChanged", {
        names,
        pathsChanged: paths.map((p) => p.path),
      })
    }
  }

  private invalidateCached(modules: GardenModule[]) {
    // invalidate the cache for anything attached to the module path or upwards in the directory tree
    for (const module of modules) {
      const cacheContext = pathToCacheContext(module.path)
      this.garden.cache.invalidateUp(cacheContext)
    }
  }
}
