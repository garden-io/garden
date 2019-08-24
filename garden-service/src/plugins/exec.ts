/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash"
import { join } from "path"
import { joiArray, joiEnvVars, validateWithPath, joi } from "../config/common"
import { createGardenPlugin } from "../types/plugin/plugin"
import { Module } from "../types/module"
import { CommonServiceSpec } from "../config/service"
import { BaseTestSpec, baseTestSpecSchema } from "../config/test"
import { readModuleVersionFile, writeModuleVersionFile, ModuleVersion } from "../vcs/vcs"
import { GARDEN_BUILD_VERSION_FILENAME } from "../constants"
import { ModuleSpec, BaseBuildSpec, baseBuildSpecSchema, ModuleConfig } from "../config/module"
import execa = require("execa")
import { BaseTaskSpec, baseTaskSpecSchema } from "../config/task"
import { dedent } from "../util/string"
import { ConfigureModuleParams, ConfigureModuleResult } from "../types/plugin/module/configure"
import { GetBuildStatusParams, BuildStatus } from "../types/plugin/module/getBuildStatus"
import { BuildModuleParams, BuildResult } from "../types/plugin/module/build"
import { TestModuleParams } from "../types/plugin/module/testModule"
import { TestResult } from "../types/plugin/module/getTestResult"
import { RunTaskParams, RunTaskResult } from "../types/plugin/task/runTask"

export interface ExecTestSpec extends BaseTestSpec {
  command: string[],
  env: { [key: string]: string },
}

export const execTestSchema = baseTestSpecSchema
  .keys({
    command: joi.array().items(joi.string())
      .description("The command to run in the module build context in order to test it."),
    env: joiEnvVars(),
  })
  .description("The test specification of an exec module.")

export interface ExecTaskSpec extends BaseTaskSpec {
  command: string[],
}

export const execTaskSpecSchema = baseTaskSpecSchema
  .keys({
    command: joi.array().items(joi.string())
      .description("The command to run in the module build context."),
  })
  .description("A task that can be run in this module.")

interface ExecBuildSpec extends BaseBuildSpec {
  command: string[]
}

export interface ExecModuleSpec extends ModuleSpec {
  build: ExecBuildSpec,
  env: { [key: string]: string },
  tasks: ExecTaskSpec[],
  tests: ExecTestSpec[],
}

export type ExecModuleConfig = ModuleConfig<ExecModuleSpec>

export const execBuildSpecSchema = baseBuildSpecSchema
  .keys({
    command: joiArray(joi.string())
      .description("The command to run inside the module's directory to perform the build.")
      .example([["npm", "run", "build"], {}]),
  })

export const execModuleSpecSchema = joi.object()
  .keys({
    build: execBuildSpecSchema,
    env: joiEnvVars(),
    tasks: joiArray(execTaskSpecSchema)
      .description("A list of tasks that can be run in this module."),
    tests: joiArray(execTestSchema)
      .description("A list of tests to run in the module."),
  })
  .unknown(false)
  .description("The module specification for an exec module.")

export interface ExecModule extends Module<ExecModuleSpec, CommonServiceSpec, ExecTestSpec> { }

export async function configureExecModule(
  { ctx, moduleConfig }: ConfigureModuleParams<ExecModule>,
): Promise<ConfigureModuleResult> {

  moduleConfig.spec = validateWithPath({
    config: moduleConfig.spec,
    schema: execModuleSpecSchema,
    name: moduleConfig.name,
    path: moduleConfig.path,
    projectRoot: ctx.projectRoot,
  })

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map(t => ({
    name: t.name,
    dependencies: t.dependencies,
    timeout: t.timeout,
    spec: t,
  }))

  moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
    name: t.name,
    dependencies: t.dependencies,
    spec: t,
    timeout: t.timeout,
  }))

  return moduleConfig
}

export async function getExecModuleBuildStatus({ module }: GetBuildStatusParams): Promise<BuildStatus> {
  const buildVersionFilePath = join(module.buildMetadataPath, GARDEN_BUILD_VERSION_FILENAME)
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

export async function buildExecModule({ module }: BuildModuleParams<ExecModule>): Promise<BuildResult> {
  const output: BuildResult = {}
  const buildPath = module.buildPath

  if (module.spec.build.command.length) {
    const res = await execa(
      module.spec.build.command.join(" "),
      {
        cwd: buildPath,
        env: { ...process.env, ...mapValues(module.spec.env, v => v.toString()) },
        shell: true,
      },
    )

    output.fresh = true
    output.buildLog = res.stdout + res.stderr
  }

  // keep track of which version has been built
  const buildVersionFilePath = join(module.buildMetadataPath, GARDEN_BUILD_VERSION_FILENAME)
  await writeModuleVersionFile(buildVersionFilePath, module.version)

  return output
}

export async function testExecModule({ module, testConfig }: TestModuleParams<ExecModule>): Promise<TestResult> {
  const startedAt = new Date()
  const command = testConfig.spec.command

  const result = await execa(
    command.join(" "),
    {
      cwd: module.buildPath,
      env: {
        ...process.env,
        // need to cast the values to strings
        ...mapValues(module.spec.env, v => v + ""),
        ...mapValues(testConfig.spec.env, v => v + ""),
      },
      reject: false,
      shell: true,
    },
  )

  return {
    moduleName: module.name,
    command,
    testName: testConfig.name,
    version: module.version.versionString,
    success: result.exitCode === 0,
    startedAt,
    completedAt: new Date(),
    log: result.stdout + result.stderr,
  }
}

export async function runExecTask(params: RunTaskParams): Promise<RunTaskResult> {
  const { task } = params
  const module = task.module
  const command = task.spec.command
  const startedAt = new Date()

  let completedAt: Date
  let log: string

  if (command && command.length) {
    const commandResult = await execa(
      command.join(" "),
      {
        cwd: module.buildPath,
        env: { ...process.env, ...mapValues(module.spec.env, v => v.toString()) },
        shell: true,
      },
    )

    completedAt = new Date()
    log = (commandResult.stdout + commandResult.stderr).trim()
  } else {
    completedAt = startedAt
    log = ""
  }

  return <RunTaskResult>{
    moduleName: module.name,
    taskName: task.name,
    command,
    version: module.version.versionString,
    success: true,
    log,
    outputs: {
      log,
    },
    startedAt,
    completedAt,
  }
}

export const execPlugin = createGardenPlugin({
  name: "exec",
  createModuleTypes: [{
    name: "exec",
    docs: dedent`
      A simple module for executing commands in your shell. This can be a useful escape hatch if no other module
      type fits your needs, and you just need to execute something (as opposed to deploy it, track its status etc.).
    `,
    moduleOutputsSchema: joi.object().keys({}),
    schema: execModuleSpecSchema,
    taskOutputsSchema: joi.object()
      .keys({
        log: joi.string()
          .allow("")
          .default("")
          .description(
            "The full log from the executed task. " +
            "(Pro-tip: Make it machine readable so it can be parsed by dependant tasks and services!)",
          ),
      }),
    handlers: {
      configure: configureExecModule,
      getBuildStatus: getExecModuleBuildStatus,
      build: buildExecModule,
      runTask: runExecTask,
      testModule: testExecModule,
    },
  }],
})

export const gardenPlugin = execPlugin
