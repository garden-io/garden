/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { mapValues } from "lodash"
import { join } from "path"
import cpy = require("cpy")
import { joiArray, joiEnvVars, joi } from "../config/common"
import { validateWithPath, ArtifactSpec } from "../config/validation"
import { createGardenPlugin } from "../types/plugin/plugin"
import { Module } from "../types/module"
import { CommonServiceSpec } from "../config/service"
import { BaseTestSpec, baseTestSpecSchema } from "../config/test"
import { writeModuleVersionFile } from "../vcs/vcs"
import { GARDEN_BUILD_VERSION_FILENAME } from "../constants"
import { ModuleSpec, BaseBuildSpec, baseBuildSpecSchema, ModuleConfig } from "../config/module"
import { BaseTaskSpec, baseTaskSpecSchema } from "../config/task"
import { dedent } from "../util/string"
import { ConfigureModuleParams, ConfigureModuleResult } from "../types/plugin/module/configure"
import { BuildModuleParams, BuildResult } from "../types/plugin/module/build"
import { TestModuleParams } from "../types/plugin/module/testModule"
import { TestResult } from "../types/plugin/module/getTestResult"
import { RunTaskParams, RunTaskResult } from "../types/plugin/task/runTask"
import { exec } from "../util/util"
import { ConfigurationError } from "../exceptions"
import { LogEntry } from "../logger/log-entry"

const execPathDoc = dedent`
  By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
  If the top level \`local\` directive is set to \`true\`, the command runs in the module source directory instead.
`

const artifactSchema = joi.object().keys({
  source: joi
    .posixPath()
    .allowGlobs()
    .relativeOnly()
    .subPathOnly()
    .required()
    .description("A POSIX-style path or glob to copy, relative to the build root."),
  target: joi
    .posixPath()
    .relativeOnly()
    .subPathOnly()
    .default(".")
    .description("A POSIX-style path to copy the artifact to, relative to the project artifacts directory."),
})

const artifactsSchema = joi.array().items(artifactSchema)

export interface ExecTestSpec extends BaseTestSpec {
  command: string[]
  env: { [key: string]: string }
  artifacts?: ArtifactSpec[]
}

export const execTestSchema = baseTestSpecSchema
  .keys({
    command: joi
      .array()
      .items(joi.string())
      .description(
        dedent`
        The command to run to test the module.

        ${execPathDoc}
      `
      )
      .required(),
    env: joiEnvVars(),
    artifacts: artifactsSchema.description("A list of artifacts to copy after the test run."),
  })
  .description("The test specification of an exec module.")

export interface ExecTaskSpec extends BaseTaskSpec {
  artifacts?: ArtifactSpec[]
  command: string[]
  env: { [key: string]: string }
}

export const execTaskSpecSchema = baseTaskSpecSchema
  .keys({
    artifacts: artifactsSchema.description("A list of artifacts to copy after the task run."),
    command: joi
      .array()
      .items(joi.string())
      .description(
        dedent`
        The command to run.

        ${execPathDoc}
      `
      )
      .required(),
    env: joiEnvVars(),
  })
  .description("A task that can be run in this module.")

interface ExecBuildSpec extends BaseBuildSpec {
  command: string[]
}

export interface ExecModuleSpecBase extends ModuleSpec {
  build: ExecBuildSpec
  env: { [key: string]: string }
  tasks: ExecTaskSpec[]
  tests: ExecTestSpec[]
}

export interface ExecModuleSpec extends ExecModuleSpecBase {
  local?: boolean
}

export type ExecModuleConfig = ModuleConfig<ExecModuleSpec, any, ExecTestSpec, ExecTaskSpec>

export const execBuildSpecSchema = baseBuildSpecSchema.keys({
  command: joiArray(joi.string())
    .description(
      dedent`
        The command to run to perform the build.

        ${execPathDoc}
      `
    )
    .example(["npm", "run", "build"]),
})

export const execModuleSpecSchema = joi
  .object()
  .keys({
    local: joi
      .boolean()
      .description(
        dedent`
        If set to true, Garden will run the build command, tests, and tasks in the module source directory,
        instead of in the Garden build directory (under .garden/build/<module-name>).

        Garden will therefore not stage the build for local exec modules. This means that include/exclude filters
        and ignore files are not applied to local exec modules.
      `
      )
      .default(false),
    build: execBuildSpecSchema,
    env: joiEnvVars(),
    tasks: joiArray(execTaskSpecSchema).description("A list of tasks that can be run in this module."),
    tests: joiArray(execTestSchema).description("A list of tests to run in the module."),
  })
  .unknown(false)
  .description("The module specification for an exec module.")

export interface ExecModule extends Module<ExecModuleSpec, CommonServiceSpec, ExecTestSpec, ExecTaskSpec> {}

export async function configureExecModule({
  ctx,
  moduleConfig,
}: ConfigureModuleParams<ExecModule>): Promise<ConfigureModuleResult> {
  const buildDeps = moduleConfig.build.dependencies
  if (moduleConfig.spec.local && buildDeps.some((d) => d.copy.length > 0)) {
    const buildDependenciesWithCopySpec = buildDeps
      .filter((d) => !!d.copy)
      .map((d) => d.name)
      .join(", ")
    throw new ConfigurationError(
      dedent`
      Invalid exec module configuration: Module ${moduleConfig.name} copies ${buildDependenciesWithCopySpec}

      A local exec module cannot have a build dependency with a copy spec.
    `,
      {
        buildDependenciesWithCopySpec,
        buildConfig: moduleConfig.build,
      }
    )
  }

  moduleConfig.spec = validateWithPath({
    config: moduleConfig.spec,
    schema: execModuleSpecSchema,
    name: moduleConfig.name,
    path: moduleConfig.path,
    projectRoot: ctx.projectRoot,
  })

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map((t) => ({
    name: t.name,
    dependencies: t.dependencies,
    disabled: t.disabled,
    timeout: t.timeout,
    spec: t,
  }))

  moduleConfig.testConfigs = moduleConfig.spec.tests.map((t) => ({
    name: t.name,
    dependencies: t.dependencies,
    disabled: t.disabled,
    spec: t,
    timeout: t.timeout,
  }))

  return { moduleConfig }
}

export async function buildExecModule({ module }: BuildModuleParams<ExecModule>): Promise<BuildResult> {
  const output: BuildResult = {}
  const { command } = module.spec.build

  if (command.length) {
    const result = await exec(command.join(" "), [], {
      cwd: module.buildPath,
      env: {
        ...process.env,
        ...mapValues(module.spec.env, (v) => v.toString()),
      },
      shell: true,
    })

    output.fresh = true
    output.buildLog = result.stdout + result.stderr
  }

  // keep track of which version has been built
  const buildVersionFilePath = join(module.buildMetadataPath, GARDEN_BUILD_VERSION_FILENAME)
  await writeModuleVersionFile(buildVersionFilePath, module.version)

  return output
}

export async function testExecModule({
  log,
  module,
  testConfig,
  artifactsPath,
}: TestModuleParams<ExecModule>): Promise<TestResult> {
  const startedAt = new Date()
  const { command } = testConfig.spec

  const result = await exec(command.join(" "), [], {
    cwd: module.buildPath,
    env: {
      ...process.env,
      // need to cast the values to strings
      ...mapValues(module.spec.env, (v) => v + ""),
      ...mapValues(testConfig.spec.env, (v) => v + ""),
    },
    reject: false,
    shell: true,
  })

  await copyArtifacts(log, testConfig.spec.artifacts, module.buildPath, artifactsPath)

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

export async function runExecTask(params: RunTaskParams<ExecModule>): Promise<RunTaskResult> {
  const { artifactsPath, log, task } = params
  const module = task.module
  const command = task.spec.command
  const startedAt = new Date()

  let completedAt: Date
  let outputLog: string

  if (command && command.length) {
    const commandResult = await exec(command.join(" "), [], {
      cwd: module.buildPath,
      env: {
        ...process.env,
        ...mapValues(module.spec.env, (v) => v.toString()),
        ...mapValues(task.spec.env, (v) => v.toString()),
      },
      shell: true,
    })

    completedAt = new Date()
    outputLog = (commandResult.stdout + commandResult.stderr).trim()
  } else {
    completedAt = startedAt
    outputLog = ""
  }

  await copyArtifacts(log, task.spec.artifacts, module.buildPath, artifactsPath)

  return {
    moduleName: module.name,
    taskName: task.name,
    command,
    version: module.version.versionString,
    // the exec call throws on error so we can assume success if we made it this far
    success: true,
    log: outputLog,
    outputs: {
      log: outputLog,
    },
    startedAt,
    completedAt,
  }
}

export const execPlugin = createGardenPlugin({
  name: "exec",
  createModuleTypes: [
    {
      name: "exec",
      docs: dedent`
      A simple module for executing commands in your shell. This can be a useful escape hatch if no other module
      type fits your needs, and you just need to execute something (as opposed to deploy it, track its status etc.).

      By default, the \`exec\` module type executes the commands in the Garden build directory
      (under .garden/build/<module-name>). By setting \`local: true\`, the commands are executed in the module
      source directory instead.

      Note that Garden does not sync the source code for local exec modules into the Garden build directory.
      This means that include/exclude filters and ignore files are not applied to local exec modules, as the
      filtering is done during the sync.
    `,
      moduleOutputsSchema: joi.object().keys({}),
      schema: execModuleSpecSchema,
      taskOutputsSchema: joi.object().keys({
        log: joi
          .string()
          .allow("")
          .default("")
          .description(
            "The full log from the executed task. " +
              "(Pro-tip: Make it machine readable so it can be parsed by dependant tasks and services!)"
          ),
      }),
      handlers: {
        configure: configureExecModule,
        build: buildExecModule,
        runTask: runExecTask,
        testModule: testExecModule,
      },
    },
  ],
})

export const gardenPlugin = execPlugin

async function copyArtifacts(
  log: LogEntry,
  artifacts: ArtifactSpec[] | undefined,
  from: string,
  artifactsPath: string
) {
  return Bluebird.map(artifacts || [], async (spec) => {
    log.verbose(`→ Copying artifacts ${spec.source}`)

    await cpy(spec.source, join(artifactsPath, spec.target || "."), { cwd: from })
  })
}
