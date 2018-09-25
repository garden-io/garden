/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { watch } from "chokidar"
import { basename, parse, relative } from "path"
import { pathToCacheContext } from "./cache"
import { Module } from "./types/module"
import { getIgnorer, scanDirectory } from "./util/util"
import { MODULE_CONFIG_FILENAME } from "./constants"
import { Garden } from "./garden"

export type ChangeHandler = (module: Module | null, configChanged: boolean) => Promise<void>

export class FSWatcher {
  private watcher

  constructor(private garden: Garden) {
  }

  async watchModules(modules: Module[], changeHandler: ChangeHandler) {

    const projectRoot = this.garden.projectRoot
    const ignorer = await getIgnorer(projectRoot)

    const onFileChanged = this.makeFileChangedHandler(modules, changeHandler)

    this.watcher = watch(projectRoot, {
      ignored: (path, _) => {
        const relpath = relative(projectRoot, path)
        return relpath && ignorer.ignores(relpath)
      },
      ignoreInitial: true,
      persistent: true,
    })

    this.watcher
      .on("add", onFileChanged)
      .on("change", onFileChanged)
      .on("unlink", onFileChanged)

    this.watcher
      .on("addDir", await this.makeDirAddedHandler(modules, changeHandler, ignorer))
      .on("unlinkDir", this.makeDirRemovedHandler(modules, changeHandler))

  }

  private makeFileChangedHandler(modules: Module[], changeHandler: ChangeHandler) {

    return async (filePath: string) => {

      const filename = basename(filePath)
      if (filename === "garden.yml" || filename === ".gitignore" || filename === ".gardenignore") {
        await this.invalidateCachedForAll()
        return changeHandler(null, true)
      }

      const changedModule = modules.find(m => filePath.startsWith(m.path)) || null

      if (changedModule) {
        this.invalidateCached(changedModule)
      }

      return changeHandler(changedModule, false)

    }

  }

  private async makeDirAddedHandler(modules: Module[], changeHandler: ChangeHandler, ignorer) {

    const scanOpts = {
      filter: (path) => {
        const relPath = relative(this.garden.projectRoot, path)
        return !ignorer.ignores(relPath)
      },
    }

    return async (dirPath: string) => {

      let configChanged = false

      for await (const node of scanDirectory(dirPath, scanOpts)) {
        if (!node) {
          continue
        }

        if (parse(node.path).base === MODULE_CONFIG_FILENAME) {
          configChanged = true
        }
      }

      if (configChanged) {
        // The added/removed dir contains one or more garden.yml files
        await this.invalidateCachedForAll()
        return changeHandler(null, true)
      }

      const changedModule = modules.find(m => dirPath.startsWith(m.path)) || null

      if (changedModule) {
        this.invalidateCached(changedModule)
        return changeHandler(changedModule, false)
      }

    }

  }

  private makeDirRemovedHandler(modules: Module[], changeHandler: ChangeHandler) {

    return async (dirPath: string) => {

      let changedModule: Module | null = null

      for (const module of modules) {

        if (module.path.startsWith(dirPath)) {
          // at least one module's root dir was removed
          await this.invalidateCachedForAll()
          return changeHandler(null, true)
        }

        if (dirPath.startsWith(module.path)) {
          // removed dir is a subdir of changedModule's root dir
          if (!changedModule || module.path.startsWith(changedModule.path)) {
            changedModule = module
          }
        }

      }

      if (changedModule) {
        this.invalidateCached(changedModule)
        return changeHandler(changedModule, false)
      }
    }

  }

  private invalidateCached(module: Module) {
    // invalidate the cache for anything attached to the module path or upwards in the directory tree
    const cacheContext = pathToCacheContext(module.path)
    this.garden.cache.invalidateUp(cacheContext)
  }

  private async invalidateCachedForAll() {
    for (const module of await this.garden.getModules()) {
      this.invalidateCached(module)
    }
  }

  close(): void {
    this.watcher.close()
  }

}
