/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { map as bluebirdMap } from "bluebird"
import {
  dirname,
  join,
  resolve,
  sep,
} from "path"
import {
  emptyDir,
  ensureDir,
  ensureDirSync,
} from "fs-extra"
import * as Rsync from "rsync"
import { GARDEN_DIR_NAME } from "./constants"
import { execRsyncCmd } from "./util"
import {
  BuildCopySpec,
  Module,
} from "./types/module"

// Lazily construct a directory of modules inside which all build steps are performed.

const buildDirRelPath = join(GARDEN_DIR_NAME, "build")

export class BuildDir {
  buildDirPath: string

  constructor(private projectRoot: string) {
    this.buildDirPath = join(projectRoot, buildDirRelPath)
  }

  // Synchronous, so it can run in Garden's constructor.
  init() {
    ensureDirSync(this.buildDirPath)
  }

  async syncFromSrc<T extends Module>(module: T) {
    await this.sync(
      resolve(this.projectRoot, module.path),
      this.buildDirPath)
  }

  async syncDependencyProducts<T extends Module>(module: T) {
    await this.syncFromSrc(module)
    const buildPath = await this.buildPath(module)
    const config = await module.getConfig()

    await bluebirdMap(config.build.dependencies || [], (depConfig) => {
      if (!depConfig.copy) {
        return []
      }

      // Sync to the module's top-level dir by default.
      return bluebirdMap(depConfig.copy, (copy: BuildCopySpec) => {
        const sourcePath = resolve(this.buildDirPath, depConfig.name, copy.source)
        const destinationPath = dirname(resolve(buildPath, copy.target, copy.source)) + sep
        return this.sync(sourcePath, destinationPath)
      })
    })
  }

  async clear() {
    await emptyDir(this.buildDirPath)
  }

  async buildPath<T extends Module>(module: T): Promise<string> {
    const path = resolve(this.buildDirPath, module.name)
    await ensureDir(path)
    return path
  }

  private async sync(sourcePath: string, destinationPath: string): Promise<void> {
    await ensureDir(destinationPath)

    const syncCmd = new Rsync()
      .flags(["r", "p", "t", "g", "o"])
      .source(sourcePath)
      .destination(destinationPath)

    await execRsyncCmd(syncCmd)
  }

}
