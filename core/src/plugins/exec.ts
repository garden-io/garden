/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { mapValues, omit } from "lodash"
import { join } from "path"
import cpy = require("cpy")
import { joiArray, joiEnvVars, joi, joiSparseArray } from "../config/common"
import { validateWithPath, ArtifactSpec } from "../config/validation"
import { createGardenPlugin, ServiceActionHandlers } from "../types/plugin/plugin"
import { GardenModule, getModuleKey } from "../types/module"
import { baseServiceSpecSchema, CommonServiceSpec } from "../config/service"
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
import { exec, runScript } from "../util/util"
import { ConfigurationError, RuntimeError } from "../exceptions"
import { LogEntry } from "../logger/log-entry"
import { providerConfigBaseSchema } from "../config/provider"
import { ExecaError } from "execa"
import { artifactsTargetDescription } from "./container/config"
import chalk = require("chalk")
import { renderMessageWithDivider } from "../logger/util"
import { RunModuleParams } from "../types/plugin/module/runModule"
import { RunResult } from "../types/plugin/base"

const execPathDoc = dedent`
  By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
  If the top level \`local\` directive is set to \`true\`, the command runs in the module source directory instead.
`

const artifactSchema = () =>
  joi.object().keys({
    source: joi
      .posixPath()
      .allowGlobs()
      .relativeOnly()
      .subPathOnly()
      .required()
      .description("A POSIX-style path or glob to copy, relative to the build root."),
    target: joi.posixPath().relativeOnly().subPathOnly().default(".").description(artifactsTargetDescription),
  })

const artifactsSchema = () => joiSparseArray(artifactSchema())

export interface ExecServiceSpec extends CommonServiceSpec {
  cleanupCommand?: string[]
  deployCommand: string[]
  statusCommand?: string[]
  env: { [key: string]: string }
}

export const execServiceSchema = () =>
  baseServiceSpecSchema()
    .keys({
      deployCommand: joi
        .array()
        .items(joi.string().allow(""))
        .description(
          dedent`
          The command to run to deploy the service.

          ${execPathDoc}
          `
        )
        .required(),
      statusCommand: joi
        .array()
        .items(joi.string().allow(""))
        .description(
          dedent`
          Optionally set a command to check the status of the service. If this is specified, it is run before the
          \`deployCommand\`. If the command runs successfully and returns exit code of 0, the service is considered
          already deployed and the \`deployCommand\` is not run.

          If this is not specified, the service is always reported as "unknown", so it's highly recommended to specify
          this command if possible.

          ${execPathDoc}
          `
        ),
      cleanupCommand: joi
        .array()
        .items(joi.string().allow(""))
        .description(
          dedent`
          Optionally set a command to clean the service up, e.g. when running \`garden delete env\`.

          ${execPathDoc}
          `
        ),
      env: joiEnvVars().description("Environment variables to set when running the deploy and status commands."),
    })
    .description("A service to deploy using shell commands.")

export interface ExecTestSpec extends BaseTestSpec {
  command: string[]
  env: { [key: string]: string }
  artifacts?: ArtifactSpec[]
}

export const execTestSchema = () =>
  baseTestSpecSchema()
    .keys({
      command: joi
        .array()
        .items(joi.string().allow(""))
        .description(
          dedent`
          The command to run to test the module.

          ${execPathDoc}
          `
        )
        .required(),
      env: joiEnvVars().description("Environment variables to set when running the command."),
      artifacts: artifactsSchema().description("A list of artifacts to copy after the test run."),
    })
    .description("The test specification of an exec module.")

export interface ExecTaskSpec extends BaseTaskSpec {
  artifacts?: ArtifactSpec[]
  command: string[]
  env: { [key: string]: string }
}

export const execTaskSpecSchema = () =>
  baseTaskSpecSchema()
    .keys({
      artifacts: artifactsSchema().description("A list of artifacts to copy after the task run."),
      command: joi
        .array()
        .items(joi.string().allow(""))
        .description(
          dedent`
          The command to run.

          ${execPathDoc}
          `
        )
        .required(),
      env: joiEnvVars().description("Environment variables to set when running the command."),
    })
    .description("A task that can be run in this module.")

interface ExecBuildSpec extends BaseBuildSpec {
  command: string[]
}

export interface ExecModuleSpecBase extends ModuleSpec {
  build: ExecBuildSpec
  env: { [key: string]: string }
  services: ExecServiceSpec[]
  tasks: ExecTaskSpec[]
  tests: ExecTestSpec[]
}

export interface ExecModuleSpec extends ExecModuleSpecBase {
  local?: boolean
}

export type ExecModuleConfig = ModuleConfig<ExecModuleSpec, any, ExecTestSpec, ExecTaskSpec>

export const execBuildSpecSchema = () =>
  baseBuildSpecSchema().keys({
    command: joiArray(joi.string())
      .description(
        dedent`
        The command to run to perform the build.

        ${execPathDoc}
      `
      )
      .example(["npm", "run", "build"]),
  })

export const execModuleSpecSchema = () =>
  joi
    .object()
    .keys({
      local: joi
        .boolean()
        .description(
          dedent`
          If set to true, Garden will run the build command, services, tests, and tasks in the module source directory,
          instead of in the Garden build directory (under .garden/build/<module-name>).

          Garden will therefore not stage the build for local exec modules. This means that include/exclude filters
          and ignore files are not applied to local exec modules.
          `
        )
        .default(false),
      build: execBuildSpecSchema(),
      env: joiEnvVars(),
      services: joiSparseArray(execServiceSchema()).description("A list of services to deploy from this module."),
      tasks: joiSparseArray(execTaskSpecSchema()).description("A list of tasks that can be run in this module."),
      tests: joiSparseArray(execTestSchema()).description("A list of tests to run in the module."),
    })
    .unknown(false)
    .description("The module specification for an exec module.")

export interface ExecModule extends GardenModule<ExecModuleSpec, ExecServiceSpec, ExecTestSpec, ExecTaskSpec> {}

export async function configureExecModule({
  ctx,
  moduleConfig,
}: ConfigureModuleParams<ExecModule>): Promise<ConfigureModuleResult> {
  const buildDeps = moduleConfig.build.dependencies
  if (moduleConfig.spec.local && buildDeps.some((d) => d.copy.length > 0)) {
    const buildDependenciesWithCopySpec = buildDeps
      .filter((d) => !!d.copy)
      .map((d) => getModuleKey(d.name, d.plugin))
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
    configType: "Module",
    schema: execModuleSpecSchema(),
    name: moduleConfig.name,
    path: moduleConfig.path,
    projectRoot: ctx.projectRoot,
  })

  moduleConfig.buildConfig = omit(moduleConfig.spec, ["tasks", "tests"])

  moduleConfig.serviceConfigs = moduleConfig.spec.services.map((s) => ({
    name: s.name,
    dependencies: s.dependencies,
    disabled: s.disabled,
    hotReloadable: false,
    spec: s,
  }))

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map((t) => ({
    name: t.name,
    cacheResult: false,
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

function getDefaultEnvVars(module: ExecModule) {
  return {
    ...process.env,
    GARDEN_MODULE_VERSION: module.version.versionString,
    ...mapValues(module.spec.env, (v) => v.toString()),
  }
}

export async function buildExecModule({ module, log }: BuildModuleParams<ExecModule>): Promise<BuildResult> {
  const output: BuildResult = {}
  const { command } = module.spec.build

  if (command.length) {
    const result = await exec(command.join(" "), [], {
      cwd: module.buildPath,
      env: getDefaultEnvVars(module),
      // TODO: remove this in 0.13 and alert users to use e.g. sh -c '<script>' instead.
      shell: true,
    })

    output.fresh = true
    output.buildLog = result.stdout + result.stderr
  }

  if (output.buildLog) {
    const prefix = `Finished building module ${chalk.white(module.name)}. Here is the output:`
    log.verbose(renderMessageWithDivider(prefix, output.buildLog, false, chalk.gray))
  }
  // keep track of which version has been built
  const buildVersionFilePath = join(module.buildMetadataPath, GARDEN_BUILD_VERSION_FILENAME)
  await writeModuleVersionFile(buildVersionFilePath, module.version)

  return output
}

export async function testExecModule({
  log,
  module,
  test,
  artifactsPath,
}: TestModuleParams<ExecModule>): Promise<TestResult> {
  const startedAt = new Date()
  const { command } = test.config.spec

  const result = await exec(command.join(" "), [], {
    cwd: module.buildPath,
    env: {
      ...getDefaultEnvVars(module),
      ...mapValues(test.config.spec.env, (v) => v + ""),
    },
    reject: false,
    shell: true,
  })

  await copyArtifacts(log, test.config.spec.artifacts, module.buildPath, artifactsPath)

  const outputLog = (result.stdout + result.stderr).trim()
  if (outputLog) {
    const prefix = `Finished running test ${chalk.white(test.name)}. Here is the output:`
    log.verbose(renderMessageWithDivider(prefix, outputLog, false, chalk.gray))
  }

  return {
    moduleName: module.name,
    command,
    testName: test.name,
    version: test.version,
    success: result.exitCode === 0,
    startedAt,
    completedAt: new Date(),
    log: outputLog,
  }
}

export async function runExecTask(params: RunTaskParams<ExecModule>): Promise<RunTaskResult> {
  const { artifactsPath, log, task } = params
  const module = task.module
  const command = task.spec.command
  const startedAt = new Date()

  let completedAt: Date
  let outputLog: string
  let success = true

  if (command && command.length) {
    const commandResult = await exec(command.join(" "), [], {
      cwd: module.buildPath,
      env: {
        ...getDefaultEnvVars(module),
        ...mapValues(task.spec.env, (v) => v.toString()),
      },
      // We handle the error at the command level
      reject: false,
      shell: true,
    })

    completedAt = new Date()
    outputLog = (commandResult.stdout + commandResult.stderr).trim()
    success = commandResult.exitCode === 0
  } else {
    completedAt = startedAt
    outputLog = ""
  }

  if (outputLog) {
    const prefix = `Finished running task ${chalk.white(task.name)}. Here is the output:`
    log.verbose(renderMessageWithDivider(prefix, outputLog, false, chalk.gray))
  }

  await copyArtifacts(log, task.spec.artifacts, module.buildPath, artifactsPath)

  return {
    moduleName: module.name,
    taskName: task.name,
    command,
    version: task.version,
    success,
    log: outputLog,
    outputs: {
      log: outputLog,
    },
    startedAt,
    completedAt,
  }
}

export async function runExecModule(params: RunModuleParams<ExecModule>): Promise<RunResult> {
  const { module, args, interactive } = params
  const startedAt = new Date()

  let completedAt: Date
  let outputLog: string
  let success = true

  if (args && args.length) {
    const commandResult = await exec(args.join(" "), [], {
      cwd: module.buildPath,
      env: {
        ...getDefaultEnvVars(module),
        ...mapValues(module.spec.env, (v) => v.toString()),
      },
      stdio: interactive ? "inherit" : undefined,
      reject: false,
      shell: true,
    })

    completedAt = new Date()
    // Despite the types saying otherwise, stdout and stderr can be undefined when in
    // interactive mode.
    outputLog = ((commandResult.stdout || "") + (commandResult.stderr || "")).trim()
    success = commandResult.exitCode === 0
  } else {
    completedAt = startedAt
    outputLog = ""
  }

  return {
    moduleName: module.name,
    command: [],
    version: module.version.versionString,
    success,
    log: outputLog,
    startedAt,
    completedAt,
  }
}

export const getExecServiceStatus: ServiceActionHandlers["getServiceStatus"] = async (params) => {
  const { module, service } = params

  if (service.spec.statusCommand) {
    const result = await exec(service.spec.statusCommand.join(" "), [], {
      cwd: module.buildPath,
      env: {
        ...getDefaultEnvVars(module),
        ...mapValues(service.spec.env, (v) => v + ""),
      },
      reject: false,
      shell: true,
    })

    return { state: result.exitCode === 0 ? "ready" : "outdated", detail: { statusCommandOutput: result.all } }
  } else {
    return { state: "unknown", detail: {} }
  }
}

export const deployExecService: ServiceActionHandlers["deployService"] = async (params) => {
  const { module, service, log } = params

  const result = await exec(service.spec.deployCommand.join(" "), [], {
    cwd: module.buildPath,
    env: {
      ...getDefaultEnvVars(module),
      ...mapValues(service.spec.env, (v) => v + ""),
    },
    reject: true,
    shell: true,
  })

  const outputLog = (result.stdout + result.stderr).trim()
  if (outputLog) {
    const prefix = `Finished deploying service ${chalk.white(service.name)}. Here is the output:`
    log.verbose(renderMessageWithDivider(prefix, outputLog, false, chalk.gray))
  }

  return { state: "ready", detail: { deployCommandOutput: result.all } }
}

export const deleteExecService: ServiceActionHandlers["deleteService"] = async (params) => {
  const { module, service, log } = params

  if (service.spec.cleanupCommand) {
    const result = await exec(service.spec.cleanupCommand.join(" "), [], {
      cwd: module.buildPath,
      env: {
        ...getDefaultEnvVars(module),
        ...mapValues(service.spec.env, (v) => v + ""),
      },
      reject: true,
      shell: true,
    })

    return { state: "missing", detail: { cleanupCommandOutput: result.all } }
  } else {
    log.warn({
      section: service.name,
      symbol: "warning",
      msg: chalk.gray(`Missing cleanupCommand, unable to clean up service`),
    })
    return { state: "unknown", detail: {} }
  }
}

export const execPlugin = () =>
  createGardenPlugin({
    name: "exec",
    docs: dedent`
    A simple provider that allows running arbitary scripts when initializing providers, and provides the exec
    module type.

    _Note: This provider is always loaded when running Garden. You only need to explicitly declare it in your provider
    configuration if you want to configure a script for it to run._
  `,
    configSchema: providerConfigBaseSchema().keys({
      initScript: joi.string().description(dedent`
      An optional script to run in the project root when initializing providers. This is handy for running an arbitrary
      script when initializing. For example, another provider might declare a dependency on this provider, to ensure
      this script runs before resolving that provider.
    `),
    }),
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
        schema: execModuleSpecSchema(),
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
          deployService: deployExecService,
          deleteService: deleteExecService,
          getServiceStatus: getExecServiceStatus,
          runTask: runExecTask,
          runModule: runExecModule,
          testModule: testExecModule,
        },
      },
    ],
    handlers: {
      async getEnvironmentStatus({ ctx }) {
        // Return ready if there is no initScript to run
        return { ready: !ctx.provider.config.initScript, outputs: {} }
      },
      async prepareEnvironment({ ctx, log }) {
        if (ctx.provider.config.initScript) {
          try {
            log.info({ section: "exec", msg: "Running init script" })
            await runScript({ log, cwd: ctx.projectRoot, script: ctx.provider.config.initScript })
          } catch (_err) {
            const error = _err as ExecaError

            // Unexpected error (failed to execute script, as opposed to script returning an error code)
            if (!error.exitCode) {
              throw error
            }

            throw new RuntimeError(`exec provider init script exited with code ${error.exitCode}`, {
              exitCode: error.exitCode,
              stdout: error.stdout,
              stderr: error.stderr,
            })
          }
        }
        return { status: { ready: true, outputs: {} } }
      },
    },
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
