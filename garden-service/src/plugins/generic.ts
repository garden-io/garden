/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { mapValues } from "lodash"
import { join } from "path"
import {
  joiArray,
  joiEnvVars,
  validate,
} from "../config/common"
import {
  GardenPlugin,
} from "../types/plugin/plugin"
import { Module } from "../types/module"
import {
  BuildResult,
  BuildStatus,
  ValidateModuleResult,
  HotReloadResult,
  TestResult,
} from "../types/plugin/outputs"
import {
  BuildModuleParams,
  GetBuildStatusParams,
  ValidateModuleParams,
  HotReloadParams,
  TestModuleParams,
} from "../types/plugin/params"
import { BaseServiceSpec } from "../config/service"
import { BaseTestSpec, baseTestSpecSchema } from "../config/test"
import { readModuleVersionFile, writeModuleVersionFile, ModuleVersion } from "../vcs/base"
import { GARDEN_BUILD_VERSION_FILENAME } from "../constants"
import { ModuleSpec, ModuleConfig } from "../config/module"
import execa = require("execa")

export const name = "generic"

export interface GenericTestSpec extends BaseTestSpec {
  command: string[],
  env: { [key: string]: string },
}

export const genericTestSchema = baseTestSpecSchema
  .keys({
    command: Joi.array().items(Joi.string())
      .description("The command to run in the module build context in order to test it."),
    env: joiEnvVars(),
  })
  .description("The test specification of a generic module.")

export interface GenericModuleSpec extends ModuleSpec {
  env: { [key: string]: string },
  tests: GenericTestSpec[],
}

export const genericModuleSpecSchema = Joi.object()
  .keys({
    env: joiEnvVars(),
    tests: joiArray(genericTestSchema)
      .description("A list of tests to run in the module."),
  })
  .unknown(false)
  .description("The module specification for a generic module.")

export interface GenericModule extends Module<GenericModuleSpec, BaseServiceSpec, GenericTestSpec> { }

export async function parseGenericModule(
  { moduleConfig }: ValidateModuleParams<GenericModule>,
): Promise<ValidateModuleResult> {
  moduleConfig.spec = validate(moduleConfig.spec, genericModuleSpecSchema, { context: `module ${moduleConfig.name}` })

  moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
    name: t.name,
    dependencies: t.dependencies,
    spec: t,
    timeout: t.timeout,
  }))

  return moduleConfig
}

export async function getGenericModuleBuildStatus({ module }: GetBuildStatusParams): Promise<BuildStatus> {
  const buildVersionFilePath = join(module.buildPath, GARDEN_BUILD_VERSION_FILENAME)
  let builtVersion: ModuleVersion | null = null

  try {
    builtVersion = await readModuleVersionFile(buildVersionFilePath)
  } catch (_) {
    // just ignore this error, can be caused by an outdated format
  }

  if (builtVersion && builtVersion.versionString === module.version.versionString) {
    return { ready: true }
  }

  return { ready: false }
}

export async function buildGenericModule({ module }: BuildModuleParams<GenericModule>): Promise<BuildResult> {
  const config: ModuleConfig = module
  const output: BuildResult = {}
  const buildPath = module.buildPath

  if (config.build.command.length) {
    const res = await execa.shell(
      config.build.command.join(" "),
      {
        cwd: buildPath,
        env: { ...process.env, ...mapValues(module.spec.env, v => v.toString()) },
      },
    )

    output.fresh = true
    output.buildLog = res.stdout + res.stderr
  }

  // keep track of which version has been built
  const buildVersionFilePath = join(buildPath, GARDEN_BUILD_VERSION_FILENAME)
  await writeModuleVersionFile(buildVersionFilePath, module.version)

  return output
}

export async function reloadGenericModule(_: HotReloadParams<GenericModule>): Promise<HotReloadResult> {
  return {}
}

export async function testGenericModule({ module, testConfig }: TestModuleParams<GenericModule>): Promise<TestResult> {
  const startedAt = new Date()
  const command = testConfig.spec.command

  const result = await execa.shell(
    command.join(" "),
    {
      cwd: module.path,
      env: {
        ...process.env,
        // need to cast the values to strings
        ...mapValues(module.spec.env, v => v + ""),
        ...mapValues(testConfig.spec.env, v => v + ""),
      },
      reject: false,
    },
  )

  return {
    moduleName: module.name,
    command,
    testName: testConfig.name,
    version: module.version,
    success: result.code === 0,
    startedAt,
    completedAt: new Date(),
    output: result.stdout + result.stderr,
  }
}

export const genericPlugin: GardenPlugin = {
  moduleActions: {
    generic: {
      validate: parseGenericModule,
      getBuildStatus: getGenericModuleBuildStatus,
      build: buildGenericModule,
      hotReload: reloadGenericModule,
      testModule: testGenericModule,
    },
  },
}

export const gardenPlugin = () => genericPlugin
