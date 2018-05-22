/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec } from "child-process-promise"
import * as Joi from "joi"
import {
  joiArray,
  validate,
} from "../types/common"
import {
  GardenPlugin,
} from "../types/plugin"
import {
  Module,
  ModuleConfig,
  ModuleSpec,
} from "../types/module"
import {
  BuildResult,
  BuildStatus,
  ParseModuleResult,
  TestResult,
} from "../types/plugin/outputs"
import {
  BuildModuleParams,
  GetModuleBuildStatusParams,
  ParseModuleParams,
  TestModuleParams,
} from "../types/plugin/params"
import {
  ServiceConfig,
} from "../types/service"
import {
  BaseTestSpec,
  baseTestSpecSchema,
} from "../types/test"
import { spawn } from "../util"

export const name = "generic"

export interface GenericTestSpec extends BaseTestSpec {
  command: string[],
}

export const genericTestSchema = baseTestSpecSchema.keys({
  command: Joi.array().items(Joi.string()),
})

export interface GenericModuleSpec extends ModuleSpec {
  tests: GenericTestSpec[],
}

export const genericModuleSpecSchema = Joi.object().keys({
  tests: joiArray(genericTestSchema),
}).unknown(false)

export class GenericModule extends Module<GenericModuleSpec, ServiceConfig, GenericTestSpec> { }

export async function parseGenericModule(
  { moduleConfig }: ParseModuleParams<GenericModule>,
): Promise<ParseModuleResult> {
  moduleConfig.spec = validate(moduleConfig.spec, genericModuleSpecSchema, { context: `module ${moduleConfig.name}` })

  return {
    module: moduleConfig,
    services: [],
    tests: moduleConfig.spec.tests.map(t => ({
      name: t.name,
      dependencies: t.dependencies,
      spec: t,
      timeout: t.timeout,
      variables: t.variables,
    })),
  }
}

export async function buildGenericModule({ module }: BuildModuleParams): Promise<BuildResult> {
  // By default we run the specified build command in the module root, if any.
  // TODO: Keep track of which version has been built (needs local data store/cache).
  const config: ModuleConfig = module.config

  if (config.build.command) {
    const buildPath = await module.getBuildPath()
    const result = await exec(config.build.command, {
      cwd: buildPath,
      env: { ...process.env },
    })

    return {
      fresh: true,
      buildLog: result.stdout,
    }
  } else {
    return {}
  }
}

export async function testGenericModule({ module, testConfig }: TestModuleParams<GenericModule>): Promise<TestResult> {
  const startedAt = new Date()
  const command = testConfig.spec.command
  const result = await spawn(
    command[0], command.slice(1), { cwd: module.path, ignoreError: true },
  )

  return {
    moduleName: module.name,
    command,
    testName: testConfig.name,
    version: await module.getVersion(),
    success: result.code === 0,
    startedAt,
    completedAt: new Date(),
    output: result.output,
  }
}

export const genericPlugin: GardenPlugin = {
  moduleActions: {
    generic: {
      parseModule: parseGenericModule,
      buildModule: buildGenericModule,
      testModule: testGenericModule,

      async getModuleBuildStatus({ module }: GetModuleBuildStatusParams): Promise<BuildStatus> {
        // Each module handler should keep track of this for now.
        // Defaults to return false if a build command is specified.
        return { ready: !module.config.build.command }
      },
    },
  },
}

export const gardenPlugin = () => genericPlugin
