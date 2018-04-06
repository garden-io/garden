/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec } from "child-process-promise"
import {
  BuildResult,
  BuildStatus,
  ParseModuleParams,
  Plugin,
  TestModuleParams,
  TestResult,
} from "../types/plugin"
import { Module } from "../types/module"
import { spawn } from "../util"

export class GenericModuleHandler<T extends Module = Module> implements Plugin<T> {
  name = "generic"
  supportedModuleTypes = ["generic"]

  async parseModule({ ctx, config }: ParseModuleParams<T>) {
    return <T>new Module(ctx, config)
  }

  async getModuleBuildStatus({ module }: { module: T }): Promise<BuildStatus> {
    // Each module handler should keep track of this for now. Defaults to return false if a build command is specified.
    return { ready: !(await module.getConfig()).build.command }
  }

  async buildModule({ module }: { module: T }): Promise<BuildResult> {
    // By default we run the specified build command in the module root, if any.
    // TODO: Keep track of which version has been built (needs local data store/cache).
    const config = await module.getConfig()

    if (config.build.command) {
      const buildPath = await module.getBuildPath()
      const result = await exec(config.build.command, { cwd: buildPath })

      return {
        fresh: true,
        buildLog: result.stdout,
      }
    } else {
      return {}
    }
  }

  async testModule({ module, testSpec }: TestModuleParams<T>): Promise<TestResult> {
    const startedAt = new Date()
    const result = await spawn(testSpec.command[0], testSpec.command.slice(1), { cwd: module.path, ignoreError: true })

    return {
      version: await module.getVersion(),
      success: result.code === 0,
      startedAt,
      completedAt: new Date(),
      output: result.output,
    }
  }
}
