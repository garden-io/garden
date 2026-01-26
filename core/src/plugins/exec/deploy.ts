/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash-es"
import { join } from "path"
import split2 from "split2"
import type { PrimitiveMap } from "../../config/common.js"
import { dedent } from "../../util/string.js"
import type { ExecOpts } from "../../util/util.js"
import { sleep } from "../../util/util.js"
import { TimeoutError } from "../../exceptions.js"
import type { Log } from "../../logger/log-entry.js"
import type { ExecaReturnBase } from "execa"
import { execa } from "execa"
import { LogLevel } from "../../logger/logger.js"
import { createWriteStream } from "fs"
import fsExtra from "fs-extra"
const { ensureFile, readFile, remove, writeFile } = fsExtra
import { Transform } from "stream"
import { ExecLogsFollower } from "./logs.js"
import type { PluginContext } from "../../plugin-context.js"
import {
  defaultStatusTimeout,
  execCommonSchema,
  execCommonCommandDoc,
  execRuntimeOutputsSchema,
  execStaticOutputsSchema,
} from "./config.js"
import type { DeployStatus } from "../../plugin/handlers/Deploy/get-status.js"
import { deployStateToActionState } from "../../plugin/handlers/Deploy/get-status.js"
import type { ActionState, Resolved } from "../../actions/types.js"
import { convertCommandSpec, execRunCommand, getDefaultEnvVars } from "./common.js"
import { isRunning, killRecursive } from "../../process.js"
import type { GardenSdkActionDefinitionActionType, GardenSdkActionDefinitionConfigType } from "../../plugin/sdk.js"
import { sdk } from "../../plugin/sdk.js"
import { execProvider } from "./exec.js"
import { getTracePropagationEnvVars } from "../../util/open-telemetry/propagation.js"
import type { DeployState } from "../../types/service.js"
import { styles } from "../../logger/styles.js"

const persistentLocalProcRetryIntervalMs = 2500

const s = sdk.schema

export const execDeployCommandSchema = s.sparseArray(s.string()).describe(
  dedent`
    The command to run to perform the deployment.

    ${execCommonCommandDoc}
  `
)

export const execDeploySpecSchema = execCommonSchema.extend({
  persistent: s
    .boolean()
    .default(false)
    .describe(
      dedent`
      Set this to true if the \`deployCommand\` is not expected to return, and should run until the Garden command is manually terminated.

      This replaces the previously supported \`devMode\` from \`exec\` actions.

      If this is set to true, it is highly recommended to also define \`statusCommand\` if possible. Otherwise the Deploy is considered to be immediately ready once the \`deployCommand\` is started.
      `
    ),
  deployCommand: execDeployCommandSchema,
  statusCommand: s
    .sparseArray(s.string())
    .optional()
    .describe(
      dedent`
      Optionally set a command to check the status of the deployment. If this is specified, it is run before the \`deployCommand\`. If the command runs successfully and returns exit code of 0, the deployment is considered already deployed and the \`deployCommand\` is not run.

      If this is not specified, the deployment is always reported as "unknown", so it's highly recommended to specify this command if possible.

      If \`persistent: true\`, Garden will run this command at an interval until it returns a zero exit code or times out.

      ${execCommonCommandDoc}
      `
    ),
  cleanupCommand: s
    .sparseArray(s.string())
    .optional()
    .describe(
      dedent`
      Optionally set a command to clean the deployment up, e.g. when running \`garden delete env\`.

      ${execCommonCommandDoc}
      `
    ),
  statusTimeout: s.number().default(defaultStatusTimeout).describe(dedent`
    The maximum duration (in seconds) to wait for a for the \`statusCommand\` to return a zero exit code. Ignored if no \`statusCommand\` is set.
  `),
  env: s.envVars().default({}).describe("Environment variables to set when running the deploy and status commands."),
})

export const execDeploy = execProvider.createActionType({
  kind: "Deploy",
  name: "exec",
  docs: sdk.util.dedent`
    Run and manage a persistent process or service with shell commands.
  `,
  specSchema: execDeploySpecSchema,
  staticOutputsSchema: execStaticOutputsSchema,
  runtimeOutputsSchema: execRuntimeOutputsSchema,
})

export type ExecDeployConfig = GardenSdkActionDefinitionConfigType<typeof execDeploy>
export type ExecDeploy = GardenSdkActionDefinitionActionType<typeof execDeploy>

execDeploy.addHandler("configure", async ({ config }) => {
  return { config, supportedModes: { sync: !!config.spec.persistent } }
})

execDeploy.addHandler("getStatus", async (params) => {
  const { action, log, ctx } = params
  const { env, statusCommand } = action.getSpec()

  if (statusCommand && statusCommand.length > 0) {
    const result = await execRunCommand({
      command: statusCommand,
      action,
      ctx,
      log,
      env,
      opts: { reject: false },
    })

    const state = result.exitCode === 0 ? ("ready" as const) : ("outdated" as const)

    return {
      state: deployStateToActionState(state),
      detail: {
        state,
        version: action.versionString(log),
        detail: { statusCommandOutput: result.all },
      },
      outputs: result.outputs,
    }
  } else {
    const state = "unknown" as const

    return {
      state: deployStateToActionState(state),
      detail: { state, version: action.versionString(log), detail: {} },
      outputs: {
        log: "",
      },
    }
  }
})

execDeploy.addHandler("getLogs", async (params) => {
  const { action, onLogEntry, follow, ctx, log } = params

  const logFilePath = getLogFilePath({ ctx, deployName: action.name })
  const logsFollower = new ExecLogsFollower({ onLogEntry, log, logFilePath, deployName: action.name })

  if (follow) {
    ctx.events.on("abort", () => {
      logsFollower.stop()
      ctx.events.emit("done")
    })

    await logsFollower.streamLogs({ since: params.since, tail: params.tail, follow: true })
  } else {
    await logsFollower.streamLogs({ since: params.since, tail: params.tail, follow: false })
  }

  return {}
})

execDeploy.addHandler("deploy", async (params) => {
  const { action, log, ctx } = params
  const spec = action.getSpec()

  const env = spec.env

  if (spec.deployCommand.length === 0) {
    log.info("No deploy command found. Skipping.")
    return { state: "ready", detail: { state: "ready", detail: { skipped: true } }, outputs: {} }
  } else if (spec.persistent) {
    return deployPersistentExecService({ action, log, ctx, env, deployName: action.name })
  } else {
    const result = await execRunCommand({
      command: spec.deployCommand,
      action,
      ctx,
      log,
      env,
      opts: { reject: true },
    })

    const deployState: DeployState = result.success ? "ready" : "unhealthy"
    const actionState: ActionState = result.success ? "ready" : "failed"

    return {
      state: actionState,
      detail: { state: deployState, detail: { deployCommandOutput: result.all } },
      outputs: result.outputs,
    }
  }
})

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
    log.debug(`Failed resetting log file for service ${deployName} at path ${logFilePath}: ${err}`)
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

  let outputs: PrimitiveMap = {}

  if (spec.statusCommand) {
    let ready = false
    let lastStatusResult: ExecaReturnBase<string> | undefined

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

        throw new TimeoutError({
          message: dedent`Timed out waiting for local service ${deployName} to be ready.

          Garden timed out waiting for the command ${styles.primary(spec.statusCommand.join(" "))} (pid: ${proc.pid})
          to return status code 0 (success) after waiting for ${spec.statusTimeout} seconds.
          ${lastResultDescription}
          Possible next steps:

          Find out why the configured status command fails.

          In case the service just needs more time to become ready, you can adjust the ${styles.primary(
            "timeout"
          )} value
          in your service definition to a value that is greater than the time needed for your service to become ready.
          `,
        })
      }

      const result = await execRunCommand({
        command: spec.statusCommand,
        action,
        ctx,
        log,
        env,
        opts: { reject: false },
      })

      lastStatusResult = result
      ready = result.exitCode === 0
      outputs = result.outputs
    }
  }

  return {
    state: "ready",
    detail: { state: "ready", detail: { persistent: true, pid: proc.pid } },
    outputs,
  }
}

execDeploy.addHandler("delete", async (params) => {
  const { action, log, ctx } = params
  const { cleanupCommand, env } = action.getSpec()

  const pidFilePath = getPidFilePath({ ctx, deployName: action.name })
  await killProcess(log, pidFilePath, action.name)

  if (cleanupCommand) {
    const result = await execRunCommand({
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
    log.warn(`Missing cleanupCommand, unable to clean up service`)
    return { state: "unknown", detail: { state: "unknown" as const, detail: {} }, outputs: {} }
  }
})

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
        try {
          await killRecursive("SIGTERM", oldPid)
          log.debug(`Sent SIGTERM to existing ${deployName} process (PID ${oldPid})`)
        } catch (err) {
          // This most likely means that the process had already been terminated, which is fine for our purposes here.
          log.debug(`An error occurred while deleting existing ${deployName} process (PID ${oldPid}): ${err}`)
        }
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
  log,
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

  log.debug(`Starting command '${cmd} ${args.join(" ")}'`)

  const proc = execa(cmd, args, {
    cwd: action.getBuildPath(),
    env: {
      ...getDefaultEnvVars(action, log),
      ...(env ? mapValues(env, (v) => v + "") : {}),
      ...getTracePropagationEnvVars(),
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
