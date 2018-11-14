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
import { GARDEN_DIR_NAME } from "./constants"
import { ConfigurationError } from "./exceptions"
import {
  BuildCopySpec,
  Module,
  getModuleKey,
} from "./types/module"
import { zip } from "lodash"
import * as execa from "execa"
import { platform } from "os"
import { toCygwinPath } from "./util/util"

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
      await this.buildPath(module.name),
    )
  }

  async syncDependencyProducts(module: Module) {
    await this.syncFromSrc(module)
    const buildPath = await this.buildPath(module.name)
    const buildDependencies = await module.build.dependencies
    const dependencyConfigs = module.build.dependencies || []

    await bluebirdMap(zip(buildDependencies, dependencyConfigs), async ([sourceModule, depConfig]) => {
      if (!sourceModule || !depConfig || !depConfig.copy) {
        return
      }

      const sourceBuildPath = await this.buildPath(getModuleKey(sourceModule.name, sourceModule.plugin))

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

  async buildPath(moduleName: string): Promise<string> {
    const path = resolve(this.buildDirPath, moduleName)
    await ensureDir(path)
    return path
  }

  private async sync(sourcePath: string, destinationPath: string): Promise<void> {
    const destinationDir = parse(destinationPath).dir
    await ensureDir(destinationDir)

    if (platform() === "win32") {
      // this is so that the cygwin-based rsync client can deal with the paths
      sourcePath = toCygwinPath(sourcePath)
      destinationPath = toCygwinPath(destinationPath)
    }

    // the correct way to copy all contents of a folder is using a trailing slash and not a wildcard
    sourcePath = stripWildcard(sourcePath)
    destinationPath = stripWildcard(destinationPath)

    // --exclude is required for modules where the module and project are in the same directory
    await execa("rsync", ["-rptgo", `--exclude=${GARDEN_DIR_NAME}`, sourcePath, destinationPath])
  }
}

function stripWildcard(path: string) {
  return path.endsWith("/*") ? path.slice(0, -1) : path
}
