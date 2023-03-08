/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash"
import { join } from "path"
import split2 = require("split2")
import { PrimitiveMap } from "../../config/common"
import { LOGS_DIR } from "../../constants"
import { dedent } from "../../util/string"
import { ExecOpts, sleep } from "../../util/util"
import { TimeoutError } from "../../exceptions"
import { Log } from "../../logger/log-entry"
import execa, { ExecaChildProcess } from "execa"
import chalk from "chalk"
import { renderMessageWithDivider } from "../../logger/util"
import { LogLevel } from "../../logger/logger"
import { createWriteStream } from "fs"
import { ensureFile, remove } from "fs-extra"
import { Transform } from "stream"
import { ExecLogsFollower } from "./logs"
import { PluginContext } from "../../plugin-context"
import { ExecDeploy } from "./config"
import { DeployActionHandler } from "../../plugin/action-types"
import { DeployStatus } from "../../plugin/handlers/Deploy/get-status"
import { Resolved } from "../../actions/types"
import { convertCommandSpec, execRun, getDefaultEnvVars } from "./common"

const persistentLocalProcRetryIntervalMs = 2500

interface ExecProc {
  key: string
  proc: ExecaChildProcess
}

const localProcs: { [key: string]: ExecProc } = {}
const localLogsDir = join(LOGS_DIR, "local-services")

export const getExecDeployStatus: DeployActionHandler<"getStatus", ExecDeploy> = async (params) => {
  const { action, log, ctx } = params
  const { env, statusCommand } = action.getSpec()

  if (statusCommand) {
    const result = await execRun({
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
      outputs: {
        log: result.all || "",
      },
    }
  } else {
    const state = "unknown"

    return {
      state,
      detail: { state, version: action.versionString(), detail: {} },
      outputs: {
        log: "",
      },
    }
  }
}

export const getExecDeployLogs: DeployActionHandler<"getLogs", ExecDeploy> = async (params) => {
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

export const execDeployAction: DeployActionHandler<"deploy", ExecDeploy> = async (params) => {
  const { action, log, ctx } = params
  const spec = action.getSpec()

  const env = spec.env

  if (spec.deployCommand.length === 0) {
    log.info({ msg: "No deploy command found. Skipping.", symbol: "info" })
    return { state: "ready", detail: { state: "ready", detail: { skipped: true } }, outputs: {} }
  } else if (spec.persistent) {
    return deployPersistentExecService({ action, log, ctx, env, serviceName: action.name })
  } else {
    const result = await execRun({
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

export async function deployPersistentExecService({
  ctx,
  serviceName,
  log,
  action,
  env,
}: {
  ctx: PluginContext
  serviceName: string
  log: Log
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

  const spec = action.getSpec()

  if (spec.statusCommand) {
    let ready = false
    let lastStatusResult: execa.ExecaReturnBase<string> | undefined

    while (!ready) {
      await sleep(persistentLocalProcRetryIntervalMs)

      const now = new Date()
      const timeElapsedSec = (now.getTime() - startedAt.getTime()) / 1000

      if (timeElapsedSec > spec.statusTimeout) {
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

          Garden timed out waiting for the command ${chalk.gray(spec.statusCommand)}
          to return status code 0 (success) after waiting for ${spec.statusTimeout} seconds.
          ${lastResultDescription}
          Possible next steps:

          Find out why the configured status command fails.

          In case the service just needs more time to become ready, you can adjust the ${chalk.gray("timeout")} value
          in your service definition to a value that is greater than the time needed for your service to become ready.
          `,
          {
            serviceName,
            statusCommand: spec.statusCommand,
            pid: proc.pid,
            statusTimeout: spec.statusTimeout,
          }
        )
      }

      const result = await execRun({
        command: spec.statusCommand,
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
    persistent: true,
  }
}

export const deleteExecDeploy: DeployActionHandler<"delete", ExecDeploy> = async (params) => {
  const { action, log, ctx } = params
  const { cleanupCommand, env } = action.getSpec()

  if (cleanupCommand) {
    const result = await execRun({
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

export function getLogFilePath({ projectRoot, deployName }: { projectRoot: string; deployName: string }) {
  return join(projectRoot, localLogsDir, `${deployName}.jsonl`)
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
  action,
  env,
  serviceName,
  logFilePath,
  opts = {},
}: {
  action: Resolved<ExecDeploy>
  log: Log
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

  const shell = !!action.getSpec().shell
  const { cmd, args } = convertCommandSpec(action.getSpec("deployCommand"), shell)

  const proc = execa(cmd, args, {
    cwd: action.getBuildPath(),
    env: {
      ...getDefaultEnvVars(action),
      ...(env ? mapValues(env, (v) => v + "") : {}),
    },
    shell,
    cleanup: true,
    ...opts,
  })
  proc.stdout?.pipe(split2()).pipe(toLogEntry(LogLevel.info)).pipe(createWriteStream(logFilePath))
  proc.stderr?.pipe(split2()).pipe(toLogEntry(LogLevel.error)).pipe(createWriteStream(logFilePath))

  return proc
}
