/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec } from "child-process-promise"
import {
  BuildModuleParams,
  BuildResult,
  BuildStatus,
  GetModuleBuildStatusParams,
  ParseModuleParams,
  TestModuleParams,
  TestResult,
} from "../types/plugin"
import {
  Module,
  ModuleConfig,
} from "../types/module"
import {
  ServiceConfig,
} from "../types/service"
import { spawn } from "../util"
import { mapValues } from "lodash"

export const name = "generic"

// TODO: find a different way to solve type export issues
let _serviceConfig: ServiceConfig

export const genericPlugin = {
  moduleActions: {
    generic: {
      async parseModule({ ctx, moduleConfig }: ParseModuleParams): Promise<Module> {
        return new Module(ctx, moduleConfig)
      },

      async getModuleBuildStatus({ module }: GetModuleBuildStatusParams): Promise<BuildStatus> {
        // Each module handler should keep track of this for now.
        // Defaults to return false if a build command is specified.
        return { ready: !(await module.getConfig()).build.command }
      },

      async buildModule({ module, buildContext }: BuildModuleParams): Promise<BuildResult> {
        // By default we run the specified build command in the module root, if any.
        // TODO: Keep track of which version has been built (needs local data store/cache).
        const config: ModuleConfig = await module.getConfig()

        const contextEnv = mapValues(buildContext, v => v + "")

        if (config.build.command) {
          const buildPath = await module.getBuildPath()
          const result = await exec(config.build.command, {
            cwd: buildPath,
            env: { ...process.env, contextEnv },
          })

          return {
            fresh: true,
            buildLog: result.stdout,
          }
        } else {
          return {}
        }
      },

      async testModule({ module, testSpec }: TestModuleParams): Promise<TestResult> {
        const startedAt = new Date()
        const result = await spawn(
          testSpec.command[0], testSpec.command.slice(1), { cwd: module.path, ignoreError: true },
        )

        return {
          version: await module.getVersion(),
          success: result.code === 0,
          startedAt,
          completedAt: new Date(),
          output: result.output,
        }
      },
    },
  },
}

export const gardenPlugin = () => genericPlugin
