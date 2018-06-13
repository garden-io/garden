/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { map as bluebirdMap } from "bluebird"
import {
  isAbsolute,
  join,
  parse,
  resolve,
  sep,
} from "path"
import {
  emptyDir,
  ensureDir,
} from "fs-extra"
import * as Rsync from "rsync"
import { GARDEN_DIR_NAME } from "./constants"
import { ConfigurationError } from "./exceptions"
import { execRsyncCmd } from "./util/util"
import {
  BuildCopySpec,
  Module,
} from "./types/module"
import { zip } from "lodash"

// Lazily construct a directory of modules inside which all build steps are performed.

const buildDirRelPath = join(GARDEN_DIR_NAME, "build")

export class BuildDir {
  constructor(private projectRoot: string, public buildDirPath: string) { }

  static async factory(projectRoot: string) {
    const buildDirPath = join(projectRoot, buildDirRelPath)
    await ensureDir(buildDirPath)
    return new BuildDir(projectRoot, buildDirPath)
  }

  async syncFromSrc(module: Module) {
    await this.sync(
      resolve(this.projectRoot, module.path) + sep,
      await this.buildPath(module),
    )
  }

  async syncDependencyProducts(module: Module) {
    await this.syncFromSrc(module)
    const buildPath = await this.buildPath(module)
    const buildDependencies = await module.getBuildDependencies()
    const dependencyConfigs = module.config.build.dependencies || []

    await bluebirdMap(zip(buildDependencies, dependencyConfigs), async ([sourceModule, depConfig]) => {
      if (!sourceModule || !depConfig || !depConfig.copy) {
        return
      }

      const sourceBuildPath = await this.buildPath(sourceModule)

      // Sync to the module's top-level dir by default.
      await bluebirdMap(depConfig.copy, (copy: BuildCopySpec) => {
        if (isAbsolute(copy.source)) {
          throw new ConfigurationError(`Source path in build dependency copy spec must be a relative path`, {
            copySpec: copy,
          })
        }

        if (isAbsolute(copy.target)) {
          throw new ConfigurationError(`Target path in build dependency copy spec must be a relative path`, {
            copySpec: copy,
          })
        }

        const sourcePath = join(sourceBuildPath, copy.source)
        const destinationPath = join(buildPath, copy.target)
        return this.sync(sourcePath, destinationPath)
      })
    })
  }

  async clear() {
    await emptyDir(this.buildDirPath)
  }

  async buildPath(module: Module): Promise<string> {
    const path = resolve(this.buildDirPath, module.name)
    await ensureDir(path)
    return path
  }

  private async sync(sourcePath: string, destinationPath: string): Promise<void> {
    const destinationDir = parse(destinationPath).dir
    await ensureDir(destinationDir)

    const syncCmd = new Rsync()
      .flags(["r", "p", "t", "g", "o"])
      .source(sourcePath)
      .destination(destinationPath)

    await execRsyncCmd(syncCmd)
  }
}
