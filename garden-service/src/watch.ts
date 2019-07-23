/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { watch, FSWatcher } from "chokidar"
import { parse, relative } from "path"
import { pathToCacheContext } from "./cache"
import { Module } from "./types/module"
import { Garden } from "./garden"
import { LogEntry } from "./logger/log-entry"
import * as klaw from "klaw"
import { registerCleanupFunction } from "./util/util"
import * as Bluebird from "bluebird"
import { some } from "lodash"
import { isConfigFilename, Ignorer } from "./util/fs"

// IMPORTANT: We must use a single global instance of the watcher, because we may otherwise get
// segmentation faults on macOS! See https://github.com/fsevents/fsevents/issues/273
let watcher: FSWatcher | undefined
let ignorer: Ignorer
let projectRoot: string

const ignored = (path: string, _: any) => {
  const relpath = relative(projectRoot, path)
  return relpath && ignorer.ignores(relpath)
}

// The process hangs after tests if we don't do this
registerCleanupFunction("stop watcher", () => {
  if (watcher) {
    watcher.close()
    watcher = undefined
  }
})

export type ChangeHandler = (module: Module | null, configChanged: boolean) => Promise<void>

/**
 * Wrapper around the Chokidar file watcher. Emits events on `garden.events` when project files are changed.
 * This needs to be enabled by calling the `.start()` method, and stopped with the `.stop()` method.
 */
export class Watcher {
  private watcher: FSWatcher

  constructor(private garden: Garden, private log: LogEntry, modules: Module[]) {
    projectRoot = this.garden.projectRoot
    ignorer = this.garden.ignorer

    this.log.debug(`Watcher: Watching ${projectRoot}`)

    if (watcher === undefined) {
      watcher = watch(projectRoot, {
        ignored,
        ignoreInitial: true,
        persistent: true,
      })
    }

    this.watcher = watcher

    this.watcher
      .on("add", this.makeFileAddedHandler(modules))
      .on("change", this.makeFileChangedHandler("modified", modules))
      .on("unlink", this.makeFileChangedHandler("removed", modules))
      .on("addDir", this.makeDirAddedHandler(modules))
      .on("unlinkDir", this.makeDirRemovedHandler(modules))
  }

  stop(): void {
    if (this.watcher) {
      this.log.debug(`Watcher: Clearing handlers`)
      this.watcher.removeAllListeners()
    }
  }

  private makeFileAddedHandler(modules: Module[]) {
    return this.wrapAsync(async (path: string) => {
      this.log.debug(`Watcher: File ${path} added`)

      const changedModules = await Bluebird.filter(modules, async (m) => {
        const files = await this.garden.vcs.getFiles(m.path)
        return some(files, f => f.path === path)
      })

      this.sourcesChanged(modules, changedModules, path, "added")
    })
  }

  private wrapAsync(listener: (path: string) => Promise<void>) {
    const _this = this

    return (path: string) => {
      // Make sure Promise errors are handled appropriately.
      listener(path)
        .catch(err => {
          _this.watcher.emit("error", err)
        })
    }
  }

  private makeFileChangedHandler(type: string, modules: Module[]) {
    return (path: string) => {
      this.log.debug(`Watcher: File ${path} ${type}`)

      const changedModules = modules
        .filter(m => m.version.files.includes(path) || m.configPath === path)

      this.sourcesChanged(modules, changedModules, path, type)
    }
  }

  private sourcesChanged(modules: Module[], changedModules: Module[], path: string, type: string) {
    const parsed = parse(path)
    const filename = parsed.base

    if (isConfigFilename(filename) || filename === ".gitignore" || filename === ".gardenignore") {
      this.invalidateCached(modules)

      const changedModuleConfigs = changedModules.filter(m => m.configPath === path)

      if (changedModuleConfigs.length > 0) {
        const names = changedModuleConfigs.map(m => m.name)
        this.garden.events.emit("moduleConfigChanged", { names, path })
      } else if (isConfigFilename(filename)) {
        if (parsed.dir === this.garden.projectRoot) {
          this.garden.events.emit("projectConfigChanged", {})
        } else {
          if (type === "added") {
            this.garden.events.emit("configAdded", { path })
          } else {
            this.garden.events.emit("configRemoved", { path })
          }
        }
      }

      return
    }

    if (changedModules.length > 0) {
      const names = changedModules.map(m => m.name)
      this.invalidateCached(changedModules)
      this.garden.events.emit("moduleSourcesChanged", { names, pathChanged: path })
    }
  }

  private makeDirAddedHandler(modules: Module[]) {
    const scanOpts = {
      filter: (path) => {
        const relPath = relative(this.garden.projectRoot, path)
        return !this.garden.ignorer.ignores(relPath)
      },
    }

    return (path: string) => {
      this.log.debug(`Watcher: Directory ${path} added`)

      let configChanged = false

      // Scan the added path to see if it contains a garden.yml file
      klaw(path, scanOpts)
        .on("data", (item) => {
          const parsed = parse(item.path)
          if (item.path !== path && isConfigFilename(parsed.base)) {
            configChanged = true
            this.garden.events.emit("configAdded", { path: item.path })
          }
        })
        .on("error", (err) => {
          if ((<any>err).code === "ENOENT") {
            // This can happen if the directory is removed while scanning
            return
          } else {
            throw err
          }
        })
        .on("end", () => {
          if (configChanged) {
            // The added/removed dir contains one or more garden.yml files
            this.invalidateCached(modules)
            return
          }

          // changedModules will only have more than one element when the changed path belongs to >= 2 modules.
          const changedModules = modules.filter(m => path.startsWith(m.path))
          const changedModuleNames = changedModules.map(m => m.name)

          if (changedModules.length > 0) {
            this.invalidateCached(changedModules)
            this.garden.events.emit("moduleSourcesChanged", { names: changedModuleNames, pathChanged: path })
          }
        })
    }
  }

  private makeDirRemovedHandler(modules: Module[]) {
    return (path: string) => {
      this.log.debug(`Watcher: Directory ${path} removed`)

      for (const module of modules) {
        if (module.path.startsWith(path)) {
          // at least one module's root dir was removed
          this.invalidateCached(modules)
          this.garden.events.emit("moduleRemoved", {})
          return
        }

        if (path.startsWith(module.path)) {
          /*
           * Removed dir is a subdir of changedModules' root dir.
           * changedModules will only have more than one element when the changed path belongs to >= 2 modules.
           */
          const changedModules = modules.filter(m => path.startsWith(m.path))
          const changedModuleNames = changedModules.map(m => m.name)
          this.invalidateCached(changedModules)
          this.garden.events.emit("moduleSourcesChanged", { names: changedModuleNames, pathChanged: path })
        }
      }
    }
  }

  private invalidateCached(modules: Module[]) {
    // invalidate the cache for anything attached to the module path or upwards in the directory tree
    for (const module of modules) {
      const cacheContext = pathToCacheContext(module.path)
      this.garden.cache.invalidateUp(cacheContext)
    }
  }
}
