/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { mapValues } from "lodash"
import { join } from "path"
import split2 = require("split2")
import { joi, PrimitiveMap, StringMap } from "../../config/common"
import { ArtifactSpec } from "../../config/validation"
import { createGardenPlugin } from "../../plugin/plugin"
import { LOGS_DIR } from "../../constants"
import { dedent } from "../../util/string"
import { exec, ExecOpts, runScript, sleep } from "../../util/util"
import { RuntimeError, TimeoutError } from "../../exceptions"
import { LogEntry } from "../../logger/log-entry"
import { GenericProviderConfig, Provider, providerConfigBaseSchema } from "../../config/provider"
import execa, { ExecaError, ExecaChildProcess } from "execa"
import chalk = require("chalk")
import { renderMessageWithDivider } from "../../logger/util"
import { LogLevel } from "../../logger/logger"
import { createWriteStream } from "fs"
import { ensureFile, remove } from "fs-extra"
import { Transform } from "stream"
import { ExecLogsFollower } from "./logs"
import { PluginContext } from "../../plugin-context"
import { ConvertModuleParams } from "../../plugin/handlers/Module/convert"
import {
  ExecActionConfig,
  ExecBuild,
  execBuildActionSchema,
  ExecBuildConfig,
  ExecDeploy,
  execDeployActionSchema,
  ExecDevModeSpec,
  execRunActionSchema,
  ExecRun,
  ExecTest,
  execTestActionSchema,
  ResolvedExecAction,
} from "./config"
import { configureExecModule, ExecModule, execModuleSpecSchema } from "./moduleConfig"
import { BuildActionHandler, DeployActionHandler, RunActionHandler, TestActionHandler } from "../../plugin/action-types"
import { runResultToActionState } from "../../actions/base"
import { DeployStatus } from "../../plugin/handlers/Deploy/get-status"
import { BuildStatus } from "../../plugin/handlers/Build/get-status"
import { Resolved } from "../../actions/types"

const persistentLocalProcRetryIntervalMs = 2500

export interface ExecProviderConfig extends GenericProviderConfig {}

export type ExecProvider = Provider<ExecProviderConfig>

interface ExecProc {
  key: string
  proc: ExecaChildProcess
}

const localProcs: { [key: string]: ExecProc } = {}
const localLogsDir = join(LOGS_DIR, "local-services")

export function getLogFilePath({ projectRoot, deployName }: { projectRoot: string; deployName: string }) {
  return join(projectRoot, localLogsDir, `${deployName}.jsonl`)
}

function getDefaultEnvVars(action: ResolvedExecAction) {
  return {
    ...process.env,
    GARDEN_MODULE_VERSION: action.versionString(),
    // Workaround for https://github.com/vercel/pkg/issues/897
    PKG_EXECPATH: "",
    ...action.getSpec().env,
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
  action,
  env,
  serviceName,
  logFilePath,
  opts = {},
}: {
  command: string[]
  action: ResolvedExecAction
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
    cwd: action.getBuildPath(),
    env: {
      ...getDefaultEnvVars(action),
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
  action,
  ctx,
  log,
  env,
  opts = {},
}: {
  command: string[]
  ctx: PluginContext
  action: ResolvedExecAction
  log: LogEntry
  env?: PrimitiveMap
  opts?: ExecOpts
}) {
  const logEventContext = {
    origin: command[0],
    log,
  }

  const outputStream = split2()
  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().getTime(), data: line, ...logEventContext })
  })

  return exec(command.join(" "), [], {
    ...opts,
    cwd: action.getBuildPath(),
    env: {
      ...getDefaultEnvVars(action),
      ...(env ? mapValues(env, (v) => v + "") : {}),
    },
    // TODO: remove this in 0.13 and alert users to use e.g. sh -c '<script>' instead.
    shell: true,
    stdout: outputStream,
    stderr: outputStream,
  })
}

export const buildExecAction: BuildActionHandler<"build", ExecBuild> = async ({ action, log, ctx }) => {
  const output: BuildStatus = { state: "ready", outputs: {}, detail: {} }
  const command = action.getSpec("command")

  if (command?.length) {
    const result = await run({ command, action, ctx, log })

    if (!output.detail) {
      output.detail = {}
    }

    output.detail.fresh = true
    output.detail.buildLog = result.stdout + result.stderr
  }

  if (output.detail?.buildLog) {
    const prefix = `Finished building ${chalk.white(action.name)}. Here is the full output:`
    log.verbose(renderMessageWithDivider(prefix, output.detail?.buildLog, false, chalk.gray))
  }

  return output
}

export const execTestAction: TestActionHandler<"run", ExecTest> = async ({ log, action, artifactsPath, ctx }) => {
  const startedAt = new Date()
  const { command, env } = action.getSpec()

  const result = await run({ command, action, ctx, log, env, opts: { reject: false } })

  const artifacts = action.getSpec("artifacts")
  await copyArtifacts(log, artifacts, action.getBuildPath(), artifactsPath)

  const outputLog = (result.stdout + result.stderr).trim()
  if (outputLog) {
    const prefix = `Finished running test ${chalk.white(test.name)}. Here is the full output:`
    log.verbose(renderMessageWithDivider(prefix, outputLog, false, chalk.gray))
  }

  const detail = {
    moduleName: action.moduleName(),
    command,
    testName: action.name,
    version: action.versionString(),
    success: result.exitCode === 0,
    startedAt,
    completedAt: new Date(),
    log: outputLog,
    outputs: {},
  }

  return {
    state: runResultToActionState(detail),
    detail,
    outputs: {},
  }
}

export const execRunAction: RunActionHandler<"run", ExecRun> = async ({ artifactsPath, log, action, ctx }) => {
  const { command, env, artifacts } = action.getSpec()
  const startedAt = new Date()

  let completedAt: Date
  let outputLog: string
  let success = true

  if (command && command.length) {
    const commandResult = await run({ command, action, ctx, log, env, opts: { reject: false } })

    completedAt = new Date()
    outputLog = (commandResult.stdout + commandResult.stderr).trim()
    success = commandResult.exitCode === 0
  } else {
    completedAt = startedAt
    outputLog = ""
  }

  if (outputLog) {
    const prefix = `Finished running task ${chalk.white(action.name)}. Here is the full output:`
    log.verbose(renderMessageWithDivider(prefix, outputLog, false, chalk.gray))
  }

  await copyArtifacts(log, artifacts, action.getBuildPath(), artifactsPath)

  const detail = {
    moduleName: action.moduleName(),
    taskName: action.name,
    command,
    version: action.versionString(),
    success,
    log: outputLog,
    outputs: {
      log: outputLog,
    },
    startedAt,
    completedAt,
  }

  return {
    state: runResultToActionState(detail),
    detail,
    outputs: {},
  }
}

const getExecDeployStatus: DeployActionHandler<"getStatus", ExecDeploy> = async (params) => {
  const { action, log, ctx } = params
  const { env, statusCommand } = action.getSpec()

  if (statusCommand) {
    const result = await run({
      command: statusCommand,
      action,
      ctx,
      log,
      env,
      opts: { reject: false },
    })

    const state = result.exitCode === 0 ? "ready" : "outdated"

    return {
      state,
      detail: {
        state,
        version: action.versionString(),
        detail: { statusCommandOutput: result.all },
      },
      outputs: {},
    }
  } else {
    const state = "unknown"

    return {
      state,
      detail: { state, version: action.versionString(), detail: {} },
      outputs: {},
    }
  }
}

const getExecDeployLogs: DeployActionHandler<"getLogs", ExecDeploy> = async (params) => {
  const { action, stream, follow, ctx, log } = params

  const logFilePath = getLogFilePath({ projectRoot: ctx.projectRoot, deployName: action.name })
  const logsFollower = new ExecLogsFollower({ stream, log, logFilePath, deployName: action.name })

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

const execDeployAction: DeployActionHandler<"deploy", ExecDeploy> = async (params) => {
  const { action, log, ctx } = params
  const spec = action.getSpec()

  const devMode = params.devMode
  const env = spec.env
  const devModeSpec = spec.devMode

  if (devMode && devModeSpec && devModeSpec.command.length > 0) {
    return deployPersistentExecService({ action, log, ctx, env, devModeSpec, serviceName: action.name })
  } else if (spec.deployCommand.length === 0) {
    log.info({ msg: "No deploy command found. Skipping.", symbol: "info" })
    return { state: "ready", detail: { state: "ready", detail: { skipped: true } }, outputs: {} }
  } else {
    const result = await run({
      command: spec.deployCommand,
      action,
      ctx,
      log,
      env,
      opts: { reject: true },
    })

    const outputLog = (result.stdout + result.stderr).trim()
    if (outputLog) {
      const prefix = `Finished deploying service ${chalk.white(action.name)}. Here is the output:`
      log.verbose(renderMessageWithDivider(prefix, outputLog, false, chalk.gray))
    }

    return {
      state: "ready",
      detail: { state: "ready", detail: { deployCommandOutput: result.all } },
      outputs: {},
    }
  }
}

async function deployPersistentExecService({
  ctx,
  serviceName,
  log,
  devModeSpec,
  action,
  env,
}: {
  ctx: PluginContext
  serviceName: string
  log: LogEntry
  devModeSpec: ExecDevModeSpec
  action: Resolved<ExecDeploy>
  env: { [key: string]: string }
}): Promise<DeployStatus> {
  ctx.events.on("abort", () => {
    const localProc = localProcs[serviceName]
    if (localProc) {
      localProc.proc.cancel()
    }
  })

  const logFilePath = getLogFilePath({ projectRoot: ctx.projectRoot, deployName: serviceName })
  try {
    await resetLogFile(logFilePath)
  } catch (err) {
    log.debug(`Failed resetting log file for service ${serviceName} at path ${logFilePath}: ${err.message}`)
  }

  const key = serviceName
  const proc = runPersistent({
    command: devModeSpec.command,
    action,
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
    let lastStatusResult: execa.ExecaReturnBase<string> | undefined

    while (!ready) {
      await sleep(persistentLocalProcRetryIntervalMs)

      const now = new Date()
      const timeElapsedSec = (now.getTime() - startedAt.getTime()) / 1000

      if (timeElapsedSec > devModeSpec.timeout) {
        let lastResultDescription = ""
        if (lastStatusResult) {
          lastResultDescription = dedent`\n\nThe last exit code was ${lastStatusResult.exitCode}.\n\n`
          if (lastStatusResult.stderr) {
            lastResultDescription += `Command error output:\n${lastStatusResult.stderr}\n\n`
          }
          if (lastStatusResult.stdout) {
            lastResultDescription += `Command output:\n${lastStatusResult.stdout}\n\n`
          }
        }

        throw new TimeoutError(
          dedent`Timed out waiting for local service ${serviceName} to be ready.

          Garden timed out waiting for the command ${chalk.gray(devModeSpec.statusCommand)}
          to return status code 0 (success) after waiting for ${devModeSpec.timeout} seconds.
          ${lastResultDescription}
          Possible next steps:

          Find out why the configured status command fails.

          In case the service just needs more time to become ready, you can adjust the ${chalk.gray("timeout")} value
          in your service definition to a value that is greater than the time needed for your service to become ready.
          `,
          {
            serviceName,
            statusCommand: devModeSpec.statusCommand,
            pid: proc.pid,
            timeout: devModeSpec.timeout,
          }
        )
      }

      const result = await run({
        command: devModeSpec.statusCommand,
        action,
        ctx,
        log,
        env,
        opts: { reject: false },
      })

      lastStatusResult = result
      ready = result.exitCode === 0
    }
  }

  return {
    state: "ready",
    detail: { state: "ready", detail: { persistent: true, pid: proc.pid } },
    outputs: {},
  }
}

const deleteExecDeploy: DeployActionHandler<"delete", ExecDeploy> = async (params) => {
  const { action, log, ctx } = params
  const { cleanupCommand, env } = action.getSpec()

  if (cleanupCommand) {
    const result = await run({
      command: cleanupCommand,
      action,
      ctx,
      log,
      env,
      opts: { reject: true },
    })

    return {
      state: "not-ready",
      detail: { state: "missing", detail: { cleanupCommandOutput: result.all } },
      outputs: {},
    }
  } else {
    log.warn({
      section: action.key(),
      symbol: "warning",
      msg: chalk.gray(`Missing cleanupCommand, unable to clean up service`),
    })
    return { state: "unknown", detail: { state: "unknown", detail: {} }, outputs: {} }
  }
}

export function prepareExecBuildAction(params: ConvertModuleParams<ExecModule>): ExecBuildConfig | undefined {
  const { module, convertBuildDependency, dummyBuild } = params

  const needsBuild =
    !!dummyBuild ||
    !!module.spec.build?.command ||
    // We create a single Build action if there are no other entities
    // (otherwise nothing is created, which would be unexpected for users).
    module.serviceConfigs.length + module.taskConfigs.length + module.testConfigs.length === 0

  if (needsBuild) {
    return {
      kind: "Build",
      type: "exec",
      name: module.name,

      ...params.baseFields,
      ...dummyBuild,

      buildAtSource: module.spec.local,
      dependencies: module.build.dependencies.map(convertBuildDependency),

      spec: {
        command: module.spec.build?.command,
        env: module.spec.env,
      },
    }
  }

  return
}

export async function convertExecModule(params: ConvertModuleParams<ExecModule>) {
  const { module, services, tasks, tests, convertBuildDependency, convertRuntimeDependencies } = params

  const actions: ExecActionConfig[] = []

  const buildAction = prepareExecBuildAction(params)
  buildAction && actions.push(buildAction)

  function prepRuntimeDeps(deps: string[]): string[] {
    if (buildAction) {
      return convertRuntimeDependencies(deps)
    } else {
      // If we don't return a Build action, we must still include any declared build dependencies
      return [...module.build.dependencies.map(convertBuildDependency), ...convertRuntimeDependencies(deps)]
    }
  }

  // Instead of doing this at runtime, we fold together env vars from the module top-level and the individual
  // runtime actions at conversion time.
  function prepareEnv(env: StringMap) {
    return { ...module.spec.env, ...env }
  }

  for (const service of services) {
    actions.push({
      kind: "Deploy",
      type: "exec",
      name: service.name,
      ...params.baseFields,

      disabled: service.disabled,
      build: buildAction ? buildAction.name : undefined,
      dependencies: prepRuntimeDeps(service.spec.dependencies),

      spec: {
        cleanupCommand: service.spec.cleanupCommand,
        deployCommand: service.spec.deployCommand,
        statusCommand: service.spec.statusCommand,
        devMode: service.spec.devMode,
        timeout: service.spec.timeout,
        env: prepareEnv(service.spec.env),
      },
    })
  }

  for (const task of tasks) {
    actions.push({
      kind: "Run",
      type: "exec",
      name: task.name,
      ...params.baseFields,

      disabled: task.disabled,
      build: buildAction ? buildAction.name : undefined,
      dependencies: prepRuntimeDeps(task.spec.dependencies),
      timeout: task.spec.timeout ? task.spec.timeout : undefined,

      spec: {
        command: task.spec.command,
        artifacts: task.spec.artifacts,
        env: prepareEnv(task.spec.env),
      },
    })
  }

  for (const test of tests) {
    actions.push({
      kind: "Test",
      type: "exec",
      name: module.name + "-" + test.name,
      ...params.baseFields,

      disabled: test.disabled,
      build: buildAction ? buildAction.name : undefined,
      dependencies: prepRuntimeDeps(test.spec.dependencies),
      timeout: test.spec.timeout ? test.spec.timeout : undefined,

      spec: {
        command: test.spec.command,
        artifacts: test.spec.artifacts,
        env: prepareEnv(test.spec.env),
      },
    })
  }

  return {
    group: {
      // This is an annoying TypeScript limitation :P
      kind: <"Group">"Group",
      name: module.name,
      path: module.path,
      actions,
      variables: module.variables,
      varfiles: module.varfile ? [module.varfile] : undefined,
    },
  }
}

export const execPlugin = () =>
  createGardenPlugin({
    name: "exec",
    docs: dedent`
      A simple provider that allows running arbitrary scripts when initializing providers, and provides the exec
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
    createActionTypes: {
      Build: [
        {
          name: "exec",
          docs: dedent`
            A simple Build action which runs a build locally with a shell command.
          `,
          schema: execBuildActionSchema(),
          handlers: {
            build: buildExecAction,
          },
        },
      ],
      Deploy: [
        {
          name: "exec",
          docs: dedent`
            Run and manage a persistent process or service with shell commands.
          `,
          schema: execDeployActionSchema(),
          handlers: {
            deploy: execDeployAction,
            delete: deleteExecDeploy,
            getLogs: getExecDeployLogs,
            getStatus: getExecDeployStatus,
          },
        },
      ],
      Run: [
        {
          name: "exec",
          docs: dedent`
            A simple Run action which runs a command locally with a shell command.
          `,
          schema: execRunActionSchema(),
          handlers: {
            run: execRunAction,
          },
        },
      ],
      Test: [
        {
          name: "exec",
          docs: dedent`
            A simple Test action which runs a command locally with a shell command.
          `,
          schema: execTestActionSchema(),
          handlers: {
            run: execTestAction,
          },
        },
      ],
    },
    createModuleTypes: [
      {
        name: "exec",
        docs: dedent`
          A general-purpose module for executing commands in your shell. This can be a useful escape hatch if no other module type fits your needs, and you just need to execute something (as opposed to deploy it, track its status etc.).

          By default, the \`exec\` module type executes the commands in the Garden build directory
          (under .garden/build/<module-name>). By setting \`local: true\`, the commands are executed in the module
          source directory instead.

          Note that Garden does not sync the source code for local exec modules into the Garden build directory.
          This means that include/exclude filters and ignore files are not applied to local exec modules, as the
          filtering is done during the sync.
        `,
        needsBuild: true,
        moduleOutputsSchema: joi.object().keys({}),
        schema: execModuleSpecSchema(),
        handlers: {
          configure: configureExecModule,
          convert: convertExecModule,
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
