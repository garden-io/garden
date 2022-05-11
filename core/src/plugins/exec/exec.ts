/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { mapValues, omit } from "lodash"
import { join } from "path"
import split2 = require("split2")
import { joiArray, joiEnvVars, joi, joiSparseArray, PrimitiveMap } from "../../config/common"
import { validateWithPath, ArtifactSpec } from "../../config/validation"
import { createGardenPlugin, ServiceActionHandlers } from "../../types/plugin/plugin"
import { GardenModule, getModuleKey } from "../../types/module"
import { baseServiceSpecSchema, CommonServiceSpec } from "../../config/service"
import { BaseTestSpec, baseTestSpecSchema } from "../../config/test"
import { writeModuleVersionFile } from "../../vcs/vcs"
import { GARDEN_BUILD_VERSION_FILENAME, LOGS_DIR } from "../../constants"
import { ModuleSpec, BaseBuildSpec, baseBuildSpecSchema, ModuleConfig } from "../../config/module"
import { BaseTaskSpec, baseTaskSpecSchema } from "../../config/task"
import { dedent } from "../../util/string"
import { ConfigureModuleParams, ConfigureModuleResult } from "../../types/plugin/module/configure"
import { BuildModuleParams, BuildResult } from "../../types/plugin/module/build"
import { TestModuleParams } from "../../types/plugin/module/testModule"
import { TestResult } from "../../types/plugin/module/getTestResult"
import { RunTaskParams, RunTaskResult } from "../../types/plugin/task/runTask"
import { createOutputStream, exec, ExecOpts, runScript, sleep } from "../../util/util"
import { ConfigurationError, RuntimeError, TimeoutError } from "../../exceptions"
import { LogEntry } from "../../logger/log-entry"
import { providerConfigBaseSchema } from "../../config/provider"
import execa, { ExecaError, ExecaChildProcess } from "execa"
import { artifactsTargetDescription } from "../container/config"
import chalk = require("chalk")
import { renderMessageWithDivider } from "../../logger/util"
import { RunModuleParams } from "../../types/plugin/module/runModule"
import { RunResult } from "../../types/plugin/base"
import { LogLevel } from "../../logger/logger"
import { createWriteStream } from "fs"
import { ensureFile, remove } from "fs-extra"
import { Transform } from "stream"
import { ExecLogsFollower } from "./logs"
import { DeployServiceParams } from "../../types/plugin/service/deployService"
import { GetServiceLogsParams } from "../../types/plugin/service/getServiceLogs"
import { GetServiceStatusParams } from "../../types/plugin/service/getServiceStatus"
import { DeleteServiceParams } from "../../types/plugin/service/deleteService"
import { PluginContext } from "../../plugin-context"
import { ServiceStatus } from "../../types/service"

const execPathDoc = dedent`
  By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
  If the top level \`local\` directive is set to \`true\`, the command runs in the module source directory instead.
`
const localProcDefaultTimeoutSec = 10
const persistentLocalProcRetryIntervalMs = 2500

interface ExecProc {
  key: string
  proc: ExecaChildProcess
}

const localProcs: { [key: string]: ExecProc } = {}

const localLogsDir = join(LOGS_DIR, "local-services")

export function getLogFilePath({ projectRoot, serviceName }: { projectRoot: string; serviceName: string }) {
  return join(projectRoot, localLogsDir, `${serviceName}.jsonl`)
}

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

interface ExecServiceDevModeSpec {
  command: string[]
  timeout: number
  statusCommand?: string[]
}

export interface ExecServiceSpec extends CommonServiceSpec {
  cleanupCommand?: string[]
  deployCommand: string[]
  statusCommand?: string[]
  devMode?: ExecServiceDevModeSpec
  timeout?: number
  env: { [key: string]: string }
}

export const execServiceSchema = () =>
  baseServiceSpecSchema()
    .keys({
      deployCommand: joi
        .sparseArray()
        .items(joi.string().allow(""))
        .description(
          dedent`
          The command to run to deploy the service.

          ${execPathDoc}
          `
        )
        .required(),
      statusCommand: joi
        .sparseArray()
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
        .sparseArray()
        .items(joi.string().allow(""))
        .description(
          dedent`
          Optionally set a command to clean the service up, e.g. when running \`garden delete env\`.

          ${execPathDoc}
          `
        ),
      // TODO: Set a default in v0.13.
      timeout: joi.number().description(dedent`
        The maximum duration (in seconds) to wait for a local script to exit.
      `),
      env: joiEnvVars().description("Environment variables to set when running the deploy and status commands."),
      devMode: joi.object().keys({
        command: joi
          .sparseArray()
          .items(joi.string().allow(""))
          .description(
            dedent`
              The command to run to deploy the service in dev mode. When in dev mode, Garden assumes that
              the command starts a persistent process and does not wait for it return. The logs from the process
              can be retrieved via the \`garden logs\` command as usual.

              If a \`statusCommand\` is set, Garden will wait until it returns a zero exit code before considering
              the service ready. Otherwise it considers the service immediately ready.

              ${execPathDoc}
            `
          ),
        statusCommand: joi
          .sparseArray()
          .items(joi.string().allow(""))
          .description(
            dedent`
              Optionally set a command to check the status of the service in dev mode. Garden will run the status command
              at an interval until it returns a zero exit code or times out.

              If no \`statusCommand\` is set, Garden will consider the service ready as soon as it has started the process.

              ${execPathDoc}
              `
          ),
        timeout: joi.number().default(localProcDefaultTimeoutSec).description(dedent`
          The maximum duration (in seconds) to wait for a for the \`statusCommand\` to return a zero
          exit code. Ignored if no \`statusCommand\` is set.
        `),
      }),
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
        .sparseArray()
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
        .sparseArray()
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

  // All the config keys that affect the build version
  moduleConfig.buildConfig = omit(moduleConfig.spec, ["tasks", "tests", "services"])

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
    // Workaround for https://github.com/vercel/pkg/issues/897
    PKG_EXECPATH: "",
    ...mapValues(module.spec.env, (v) => v.toString()),
  }
}

/**
 * Truncate the log file by deleting it and recreating as an empty file.
 * This ensures that the handlers streaming logs can respond to the file change event.
 */
async function resetLogFile(logFilePath: string) {
  await remove(logFilePath)
  await ensureFile(logFilePath)
}

function runPersistent({
  command,
  module,
  env,
  serviceName,
  logFilePath,
  opts = {},
}: {
  command: string[]
  module: ExecModule
  log: LogEntry
  serviceName: string
  logFilePath: string
  env?: PrimitiveMap
  opts?: ExecOpts
}) {
  const toLogEntry = (level: LogLevel) =>
    new Transform({
      transform(chunk, _encoding, cb) {
        const line = chunk.toString().trim()
        if (!line) {
          cb(null)
          return
        }
        const entry = {
          timestamp: new Date(),
          serviceName,
          msg: line,
          level,
        }
        const entryStr = JSON.stringify(entry) + "\n"
        cb(null, entryStr)
      },
    })

  const proc = execa(command.join(" "), [], {
    cwd: module.buildPath,
    env: {
      ...getDefaultEnvVars(module),
      ...(env ? mapValues(env, (v) => v + "") : {}),
    },
    // TODO: remove this in 0.13 and alert users to use e.g. sh -c '<script>' instead.
    shell: true,
    cleanup: true,
    ...opts,
  })
  proc.stdout?.pipe(split2()).pipe(toLogEntry(LogLevel.info)).pipe(createWriteStream(logFilePath))
  proc.stderr?.pipe(split2()).pipe(toLogEntry(LogLevel.error)).pipe(createWriteStream(logFilePath))

  return proc
}

async function run({
  command,
  module,
  log,
  env,
  opts = {},
}: {
  command: string[]
  module: ExecModule
  log: LogEntry
  env?: PrimitiveMap
  opts?: ExecOpts
}) {
  const stdout = createOutputStream(log.placeholder({ level: LogLevel.verbose }))

  return exec(command.join(" "), [], {
    cwd: module.buildPath,
    env: {
      ...getDefaultEnvVars(module),
      ...(env ? mapValues(env, (v) => v + "") : {}),
    },
    // TODO: remove this in 0.13 and alert users to use e.g. sh -c '<script>' instead.
    shell: true,
    stdout,
    stderr: stdout,
    ...opts,
  })
}

export async function buildExecModule({ module, log }: BuildModuleParams<ExecModule>): Promise<BuildResult> {
  const output: BuildResult = {}
  const { command } = module.spec.build

  if (command.length) {
    const result = await run({ command, module, log })

    output.fresh = true
    output.buildLog = result.stdout + result.stderr
  }

  if (output.buildLog) {
    const prefix = `Finished building module ${chalk.white(module.name)}. Here is the full output:`
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

  const result = await run({ command, module, log, env: test.config.spec.env, opts: { reject: false } })

  await copyArtifacts(log, test.config.spec.artifacts, module.buildPath, artifactsPath)

  const outputLog = (result.stdout + result.stderr).trim()
  if (outputLog) {
    const prefix = `Finished running test ${chalk.white(test.name)}. Here is the full output:`
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
    const commandResult = await run({ command, module, log, env: task.spec.env, opts: { reject: false } })

    completedAt = new Date()
    outputLog = (commandResult.stdout + commandResult.stderr).trim()
    success = commandResult.exitCode === 0
  } else {
    completedAt = startedAt
    outputLog = ""
  }

  if (outputLog) {
    const prefix = `Finished running task ${chalk.white(task.name)}. Here is the full output:`
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
  const { module, args, interactive, log } = params
  const startedAt = new Date()

  let completedAt: Date
  let outputLog: string
  let success = true

  if (args && args.length) {
    const commandResult = await run({
      command: args,
      module,
      log,
      env: module.spec.env,
      opts: { reject: false, stdio: interactive ? "inherit" : undefined },
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

export const getExecServiceStatus: ServiceActionHandlers["getServiceStatus"] = async (
  params: GetServiceStatusParams<ExecModule>
) => {
  const { module, service, log } = params

  if (service.spec.statusCommand) {
    const result = await run({
      command: service.spec.statusCommand,
      module,
      log,
      env: service.spec.env,
      opts: { reject: false },
    })

    return {
      state: result.exitCode === 0 ? "ready" : "outdated",
      version: service.version,
      detail: { statusCommandOutput: result.all },
    }
  } else {
    return { state: "unknown", version: service.version, detail: {} }
  }
}

export const getExecServiceLogs: ServiceActionHandlers["getServiceLogs"] = async (
  params: GetServiceLogsParams<ExecModule>
) => {
  const { service, stream, follow, ctx, log } = params

  const logFilePath = getLogFilePath({ projectRoot: ctx.projectRoot, serviceName: service.name })
  const logsFollower = new ExecLogsFollower({ stream, log, logFilePath, serviceName: service.name })

  if (follow) {
    ctx.events.on("abort", () => {
      logsFollower.stop()
    })

    await logsFollower.streamLogs({ since: params.since, tail: params.tail, follow: true })
  } else {
    await logsFollower.streamLogs({ since: params.since, tail: params.tail, follow: false })
  }

  return {}
}

export const deployExecService: ServiceActionHandlers["deployService"] = async (
  params: DeployServiceParams<ExecModule>
) => {
  const { module, service, log, ctx } = params

  const devMode = params.devMode || params.hotReload
  const env = service.spec.env
  const devModeSpec = service.spec.devMode
  if (devMode && devModeSpec && devModeSpec.command.length > 0) {
    return deployPersistentExecService({ module, log, ctx, env, devModeSpec, serviceName: service.name })
  } else if (service.spec.deployCommand.length === 0) {
    log.info({ msg: "No deploy command found. Skipping.", symbol: "info" })
    return { state: "ready", detail: { skipped: true } }
  } else {
    const serviceSpec = service.spec
    const result = await run({
      command: serviceSpec.deployCommand,
      module,
      log,
      env,
      opts: { reject: true },
    })

    const outputLog = (result.stdout + result.stderr).trim()
    if (outputLog) {
      const prefix = `Finished deploying service ${chalk.white(service.name)}. Here is the output:`
      log.verbose(renderMessageWithDivider(prefix, outputLog, false, chalk.gray))
    }

    return { state: "ready", detail: { deployCommandOutput: result.all } }
  }
}

async function deployPersistentExecService({
  ctx,
  serviceName,
  log,
  devModeSpec,
  module,
  env,
}: {
  ctx: PluginContext
  serviceName: string
  log: LogEntry
  devModeSpec: ExecServiceDevModeSpec
  module: ExecModule
  env: { [key: string]: string }
}): Promise<ServiceStatus> {
  ctx.events.on("abort", () => {
    const localProc = localProcs[serviceName]
    if (localProc) {
      localProc.proc.cancel()
    }
  })

  const logFilePath = getLogFilePath({ projectRoot: ctx.projectRoot, serviceName })
  try {
    await resetLogFile(logFilePath)
  } catch (err) {
    log.debug(`Failed resetting log file for service ${serviceName} at path ${logFilePath}: ${err.message}`)
  }

  const key = serviceName
  const proc = runPersistent({
    command: devModeSpec.command,
    module,
    log,
    serviceName,
    logFilePath,
    env,
    opts: { reject: true },
  })
  localProcs[key] = {
    proc,
    key,
  }

  const startedAt = new Date()

  if (devModeSpec.statusCommand) {
    let ready = false

    while (!ready) {
      await sleep(persistentLocalProcRetryIntervalMs)

      const now = new Date()
      const timeElapsedSec = (now.getTime() - startedAt.getTime()) / 1000

      if (timeElapsedSec > devModeSpec.timeout) {
        throw new TimeoutError(`Timed out waiting for local service ${serviceName} to be ready`, {
          serviceName,
          statusCommand: devModeSpec.statusCommand,
          pid: proc.pid,
          timeout: devModeSpec.timeout,
        })
      }

      const result = await run({
        command: devModeSpec.statusCommand,
        module,
        log,
        env,
        opts: { reject: false },
      })

      ready = result.exitCode === 0
    }
  }

  return { state: "ready", detail: { persistent: true, pid: proc.pid } }
}

export const deleteExecService: ServiceActionHandlers["deleteService"] = async (
  params: DeleteServiceParams<ExecModule>
) => {
  const { module, service, log } = params

  if (service.spec.cleanupCommand) {
    const result = await run({
      command: service.spec.cleanupCommand,
      module,
      log,
      env: service.spec.env,
      opts: { reject: true },
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
          getServiceLogs: getExecServiceLogs,
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

    // Note: lazy-loading for startup performance
    const cpy = require("cpy")

    await cpy(spec.source, join(artifactsPath, spec.target || "."), { cwd: from })
  })
}
