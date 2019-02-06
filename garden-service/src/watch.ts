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
import { MODULE_CONFIG_FILENAME } from "./constants"
import { Garden } from "./garden"
import { LogEntry } from "./logger/log-entry"
import * as klaw from "klaw"
import { registerCleanupFunction } from "./util/util"

export type ChangeHandler = (module: Module | null, configChanged: boolean) => Promise<void>

/**
 * Wrapper around the Chokidar file watcher. Emits events on `garden.events` when project files are changed.
 * This needs to be enabled by calling the `.start()` method, and stopped with the `.stop()` method.
 */
export class Watcher {
  private watcher: FSWatcher

  constructor(private garden: Garden, private log: LogEntry) {
  }

  /**
   * Starts the file watcher. Idempotent.
   *
   * @param modules All configured modules in the project.
   */
  start(modules: Module[]) {
    // Only run one watcher for the process
    if (this.watcher) {
      return
    }

    const projectRoot = this.garden.projectRoot
    const ignorer = this.garden.ignorer

    this.log.debug(`Watcher: Watching ${projectRoot}`)

    this.watcher = watch(projectRoot, {
      ignored: (path: string, _: any) => {
        const relpath = relative(projectRoot, path)
        return relpath && ignorer.ignores(relpath)
      },
      ignoreInitial: true,
      persistent: true,
    })

    this.watcher
      .on("add", this.makeFileChangedHandler("added", modules))
      .on("change", this.makeFileChangedHandler("modified", modules))
      .on("unlink", this.makeFileChangedHandler("removed", modules))
      .on("addDir", this.makeDirAddedHandler(modules))
      .on("unlinkDir", this.makeDirRemovedHandler(modules))

    registerCleanupFunction("clearFileWatches", () => {
      this.stop()
    })
  }

  stop(): void {
    if (this.watcher) {
      this.log.debug(`Watcher: Stopping`)

      this.watcher.close()
      delete this.watcher
    }
  }

  private makeFileChangedHandler(type: string, modules: Module[]) {
    return (path: string) => {
      this.log.debug(`Watcher: File ${path} ${type}`)

      const parsed = parse(path)
      const filename = parsed.base
      const changedModule = modules.find(m => path.startsWith(m.path)) || null

      if (filename === MODULE_CONFIG_FILENAME || filename === ".gitignore" || filename === ".gardenignore") {
        this.invalidateCached(modules)

        if (changedModule) {
          this.garden.events.emit("moduleConfigChanged", { name: changedModule.name, path })
        } else if (filename === MODULE_CONFIG_FILENAME) {
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

      if (changedModule) {
        this.invalidateCached([changedModule])
        this.garden.events.emit("moduleSourcesChanged", { name: changedModule.name, pathChanged: path })
      }
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
          if (item.path !== path && parsed.base === MODULE_CONFIG_FILENAME) {
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

          const changedModule = modules.find(m => path.startsWith(m.path))

          if (changedModule) {
            this.invalidateCached([changedModule])
            this.garden.events.emit("moduleSourcesChanged", { name: changedModule.name, pathChanged: path })
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
          this.garden.events.emit("moduleRemoved", { name: module.name })
          return
        }

        if (path.startsWith(module.path)) {
          // removed dir is a subdir of changedModule's root dir
          this.invalidateCached([module])
          this.garden.events.emit("moduleSourcesChanged", { name: module.name, pathChanged: path })
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
