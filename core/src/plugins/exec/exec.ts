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
import { writeModuleVersionFile } from "../../vcs/vcs"
import { GARDEN_BUILD_VERSION_FILENAME, LOGS_DIR } from "../../constants"
import { dedent } from "../../util/string"
import { BuildResult } from "../../types/plugin/module/build"
import { exec, ExecOpts, runScript, sleep, renderOutputStream } from "../../util/util"
import { RuntimeError, TimeoutError } from "../../exceptions"
import { LogEntry } from "../../logger/log-entry"
import { providerConfigBaseSchema } from "../../config/provider"
import execa, { ExecaError, ExecaChildProcess } from "execa"
import chalk = require("chalk")
import { renderMessageWithDivider } from "../../logger/util"
import { LogLevel } from "../../logger/logger"
import { createWriteStream } from "fs"
import { ensureFile, remove } from "fs-extra"
import { Transform } from "stream"
import { ExecLogsFollower } from "./logs"
import { PluginContext } from "../../plugin-context"
import { ServiceStatus } from "../../types/service"
import { ConvertModuleParams } from "../../plugin/handlers/module/convert"
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
} from "./config"
import { configureExecModule, ExecModule, execModuleSpecSchema } from "./moduleConfig"
import { BuildActionHandler, DeployActionHandler, RunActionHandler, TestActionHandler } from "../../plugin/action-types"
import { Action } from "../../actions/base"

const persistentLocalProcRetryIntervalMs = 2500

interface ExecProc {
  key: string
  proc: ExecaChildProcess
}

const localProcs: { [key: string]: ExecProc } = {}
const localLogsDir = join(LOGS_DIR, "local-services")

export function getLogFilePath({ projectRoot, deployName }: { projectRoot: string; deployName: string }) {
  return join(projectRoot, localLogsDir, `${deployName}.jsonl`)
}

function getDefaultEnvVars(action: Action) {
  return {
    ...process.env,
    GARDEN_MODULE_VERSION: action.version.versionString,
    // Workaround for https://github.com/vercel/pkg/issues/897
    PKG_EXECPATH: "",
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
  action: Action
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
    cwd: action.buildPath,
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
  action: Action
  ctx: PluginContext
  log: LogEntry
  env?: PrimitiveMap
  opts?: ExecOpts
}) {
  const outputStream = split2()

  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    log.setState(renderOutputStream(line.toString()))
    ctx.events.emit("log", { timestamp: new Date().getTime(), data: line })
  })

  return exec(command.join(" "), [], {
    ...opts,
    cwd: action.buildPath,
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

export const buildExecModule: BuildActionHandler<"build", ExecBuild> = async ({ action, log, ctx }) => {
  const output: BuildResult = {}
  const command = action.getSpec("command")

  if (command?.length) {
    const result = await run({ command, action, ctx, log })

    output.fresh = true
    output.buildLog = result.stdout + result.stderr
  }

  if (output.buildLog) {
    const prefix = `Finished building module ${chalk.white(action.name)}. Here is the full output:`
    log.verbose(renderMessageWithDivider(prefix, output.buildLog, false, chalk.gray))
  }
  // keep track of which version has been built
  const buildVersionFilePath = join(action.buildMetadataPath, GARDEN_BUILD_VERSION_FILENAME)
  await writeModuleVersionFile(buildVersionFilePath, action.version)

  return output
}

export const execTestAction: TestActionHandler<"run", ExecTest> = async ({ log, action, artifactsPath, ctx }) => {
  const startedAt = new Date()
  const { command, env } = action.getSpec()

  const result = await run({ command, action, ctx, log, env, opts: { reject: false } })

  const artifacts = action.getSpec("artifacts")
  await copyArtifacts(log, artifacts, action.buildPath, artifactsPath)

  const outputLog = (result.stdout + result.stderr).trim()
  if (outputLog) {
    const prefix = `Finished running test ${chalk.white(test.name)}. Here is the full output:`
    log.verbose(renderMessageWithDivider(prefix, outputLog, false, chalk.gray))
  }

  return {
    moduleName: action.moduleName || action.name,
    command,
    testName: action.name,
    version: action.version.versionString,
    success: result.exitCode === 0,
    startedAt,
    completedAt: new Date(),
    log: outputLog,
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

  await copyArtifacts(log, artifacts, action.buildPath, artifactsPath)

  return {
    moduleName: action.moduleName || action.name,
    taskName: action.name,
    command,
    version: action.version.versionString,
    success,
    log: outputLog,
    outputs: {
      log: outputLog,
    },
    startedAt,
    completedAt,
  }
}

const runExecBuild: BuildActionHandler<"run", ExecBuild> = async (params) => {
  const startedAt = new Date()

  const { action, ctx, args, interactive, log } = params
  const env = action.getSpec("env")

  let completedAt: Date
  let outputLog: string
  let success = true

  if (args && args.length) {
    const commandResult = await run({
      command: args,
      action,
      ctx,
      log,
      env,
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
    moduleName: action.moduleName || action.name,
    command: [],
    version: action.version.versionString,
    success,
    log: outputLog,
    startedAt,
    completedAt,
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

    return {
      state: result.exitCode === 0 ? "ready" : "outdated",
      version: action.version.versionString,
      detail: { statusCommandOutput: result.all },
    }
  } else {
    return { state: "unknown", version: action.version.versionString, detail: {} }
  }
}

const getExecDeployLogs: DeployActionHandler<"getLogs", ExecDeploy> = async (params) => {
  const { action, stream, follow, ctx, log } = params

  const logFilePath = getLogFilePath({ projectRoot: ctx.projectRoot, deployName: action.name })
  const logsFollower = new ExecLogsFollower({ stream, log, logFilePath, serviceName: action.name })

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
    return { state: "ready", detail: { skipped: true } }
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

    return { state: "ready", detail: { deployCommandOutput: result.all } }
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
  action: ExecDeploy
  env: { [key: string]: string }
}): Promise<ServiceStatus> {
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
        action,
        ctx,
        log,
        env,
        opts: { reject: false },
      })

      ready = result.exitCode === 0
    }
  }

  return { state: "ready", detail: { persistent: true, pid: proc.pid } }
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

    return { state: "missing", detail: { cleanupCommandOutput: result.all } }
  } else {
    log.warn({
      section: action.name,
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
    createActionTypes: {
      build: [
        {
          name: "exec",
          docs: dedent`
            A simple Build action which runs a build locally with a shell command.
          `,
          schema: execBuildActionSchema(),
          handlers: {
            build: buildExecModule,
            run: runExecBuild,
          },
        },
      ],
      deploy: [
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
      run: [
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
      test: [
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

          async convert(params: ConvertModuleParams<ExecModule>) {
            const { module, convertBuildDependency, convertRuntimeDependency, dummyBuild } = params
            const actions: ExecActionConfig[] = []

            let needsBuild = !!dummyBuild

            if (module.spec.build?.command) {
              needsBuild = true
            }

            let buildAction: ExecBuildConfig | undefined = undefined

            if (needsBuild) {
              buildAction = {
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
              actions.push(buildAction)
            }

            function prepRuntimeDeps(deps: string[]) {
              if (buildAction) {
                return deps.map(convertRuntimeDependency)
              } else {
                // If we don't return a Build action, we must still include any declared build dependencies
                return [...module.build.dependencies.map(convertBuildDependency), ...deps.map(convertRuntimeDependency)]
              }
            }

            // Instead of doing this at runtime, we fold together env vars from the module top-level and the individual
            // runtime actions at conversion time.
            function prepareEnv(env: StringMap) {
              return { ...module.spec.env, ...env }
            }

            for (const service of module.serviceConfigs) {
              actions.push({
                kind: "Deploy",
                type: "exec",
                name: service.name,
                ...params.baseFields,

                disabled: service.disabled,
                build: buildAction ? buildAction.name : undefined,
                dependencies: prepRuntimeDeps(service.spec.dependencies),

                spec: {
                  ...service.spec,
                  env: prepareEnv(service.spec.env),
                },
              })
            }

            for (const task of module.taskConfigs) {
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
                  ...task.spec,
                  env: prepareEnv(task.spec.env),
                },
              })
            }

            for (const test of module.testConfigs) {
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
                  ...test.spec,
                  env: prepareEnv(test.spec.env),
                },
              })
            }

            return {
              group: {
                kind: "Group",
                name: module.name,
                actions,
                variables: module.variables,
                varfiles: module.varfile ? [module.varfile] : undefined,
              },
            }
          },
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
