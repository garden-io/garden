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
import { dedent } from "../../util/string"
import { ExecOpts, sleep } from "../../util/util"
import { TimeoutError } from "../../exceptions"
import { Log } from "../../logger/log-entry"
import execa from "execa"
import chalk from "chalk"
import { renderMessageWithDivider } from "../../logger/util"
import { LogLevel } from "../../logger/logger"
import { createWriteStream } from "fs"
import { ensureFile, readFile, remove, writeFile } from "fs-extra"
import { Transform } from "stream"
import { ExecLogsFollower } from "./logs"
import { PluginContext } from "../../plugin-context"
import { ExecDeploy } from "./config"
import { DeployActionHandler } from "../../plugin/action-types"
import { DeployStatus } from "../../plugin/handlers/Deploy/get-status"
import { Resolved } from "../../actions/types"
import { convertCommandSpec, execRun, getDefaultEnvVars } from "./common"
import { kill } from "process"
import { isRunning } from "../../process"

const persistentLocalProcRetryIntervalMs = 2500

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

  const logFilePath = getLogFilePath({ ctx, deployName: action.name })
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
    return deployPersistentExecService({ action, log, ctx, env, deployName: action.name })
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
  deployName,
  log,
  action,
  env,
}: {
  ctx: PluginContext
  deployName: string
  log: Log
  action: Resolved<ExecDeploy>
  env: { [key: string]: string }
}): Promise<DeployStatus> {
  const logFilePath = getLogFilePath({ ctx, deployName })
  const pidFilePath = getPidFilePath({ ctx, deployName })

  try {
    await resetLogFile(logFilePath)
  } catch (err) {
    log.debug(`Failed resetting log file for service ${deployName} at path ${logFilePath}: ${err.message}`)
  }

  await killProcess(log, pidFilePath, deployName)

  const proc = runPersistent({
    action,
    log,
    deployName,
    logFilePath,
    env,
    opts: { reject: true },
  })

  const pid = proc.pid

  if (pid) {
    await writeFile(pidFilePath, "" + pid)
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
          dedent`Timed out waiting for local service ${deployName} to be ready.

          Garden timed out waiting for the command ${chalk.gray(spec.statusCommand)}
          to return status code 0 (success) after waiting for ${spec.statusTimeout} seconds.
          ${lastResultDescription}
          Possible next steps:

          Find out why the configured status command fails.

          In case the service just needs more time to become ready, you can adjust the ${chalk.gray("timeout")} value
          in your service definition to a value that is greater than the time needed for your service to become ready.
          `,
          {
            deployName,
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
  }
}

export const deleteExecDeploy: DeployActionHandler<"delete", ExecDeploy> = async (params) => {
  const { action, log, ctx } = params
  const { cleanupCommand, env } = action.getSpec()

  const pidFilePath = getPidFilePath({ ctx, deployName: action.name })
  await killProcess(log, pidFilePath, action.name)

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

function getExecMetadataPath(ctx: PluginContext) {
  return join(ctx.gardenDirPath, "exec")
}

export function getLogFilePath({ ctx, deployName }: { ctx: PluginContext; deployName: string }) {
  return join(getExecMetadataPath(ctx), `${deployName}.jsonl`)
}

function getPidFilePath({ ctx, deployName }: { ctx: PluginContext; deployName: string }) {
  return join(getExecMetadataPath(ctx), `${deployName}.pid`)
}

async function killProcess(log: Log, pidFilePath: string, deployName: string) {
  try {
    const pidString = (await readFile(pidFilePath)).toString()
    if (pidString) {
      const oldPid = parseInt(pidString, 10)
      if (isRunning(oldPid)) {
        kill(oldPid, "SIGINT")
        log.debug(`Sent SIGINT to existing ${deployName} process (PID ${oldPid})`)
      }
    }
  } catch (err) {
    // This is normal, there may not be an existing pidfile
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
  action,
  env,
  deployName,
  logFilePath,
  opts = {},
}: {
  action: Resolved<ExecDeploy>
  log: Log
  deployName: string
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
          name: deployName,
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
    detached: true, // Detach
    windowsHide: true, // Avoid a console window popping up on Windows
    stdio: ["ignore", "pipe", "pipe"],
  })
  proc.stdout?.pipe(split2()).pipe(toLogEntry(LogLevel.info)).pipe(createWriteStream(logFilePath))
  proc.stderr?.pipe(split2()).pipe(toLogEntry(LogLevel.error)).pipe(createWriteStream(logFilePath))

  return proc
}
