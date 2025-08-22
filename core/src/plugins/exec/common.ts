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
import { isPrimitive, type PrimitiveMap } from "../../config/common.js"
import type { ArtifactSpec } from "../../config/validation.js"
import type { ExecOpts } from "../../util/util.js"
import { exec } from "../../util/util.js"
import type { Log } from "../../logger/log-entry.js"
import type { PluginContext } from "../../plugin-context.js"
import type { ResolvedExecAction } from "./config.js"
import { isErrnoException, RuntimeError } from "../../exceptions.js"
import { ACTION_RUNTIME_LOCAL } from "../../plugin/base.js"
import type { ActionStatus } from "../../actions/types.js"
import tmp from "tmp-promise"
import fsExtra from "fs-extra"
import { isPlainObject } from "../../util/objects.js"
import { isDirectory } from "../../util/fs.js"

const { exists, readdir, readFile } = fsExtra

export const execOutputsJsonFilename = ".outputs.json"
const outputKeyRegex = /^[a-zA-Z][a-zA-Z0-9_\-]*$/i
const disallowedOutputKeys = ["log", "stdout", "stderr"]

export function getDefaultEnvVars(action: ResolvedExecAction, log: Log) {
  return {
    ...process.env,
    ...action.getEnvVars(log),
    ...action.getSpec().env,
  }
}

export function convertCommandSpec(command: string[], shell: boolean) {
  if (shell) {
    return { cmd: command.join(" "), args: [] }
  } else {
    return { cmd: command[0], args: command.slice(1) }
  }
}

export async function execRunCommand({
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
  log: Log
  env?: PrimitiveMap
  opts?: ExecOpts
}) {
  const logEventContext = {
    origin: command[0],
    level: "verbose" as const,
  }

  const outputStream = split2()
  outputStream.on("error", (line: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().toISOString(), msg: line.toString(), ...logEventContext })
  })
  outputStream.on("data", (line: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().toISOString(), msg: line.toString(), ...logEventContext })
  })

  const shell = !!action.getSpec().shell
  const { cmd, args } = convertCommandSpec(command, shell)
  const cwd = action.getBuildPath()

  log.debug(`Running command: ${cmd}`)
  log.debug(`Working directory: ${cwd}`)

  const tmpDir = await tmp.dir({ prefix: "garden-exec-outputs-", unsafeCleanup: true })

  const envVars = {
    ...getDefaultEnvVars(action, log),
    ...(env ? mapValues(env, (v) => v + "") : {}),
    GARDEN_ACTION_OUTPUTS_PATH: tmpDir.path,
    GARDEN_ACTION_JSON_OUTPUTS_PATH: join(tmpDir.path, execOutputsJsonFilename),
  }

  log.debug(
    `Environment variables: ${Object.entries(envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}`
  )

  try {
    const result = await exec(cmd, args, {
      ...opts,
      shell,
      cwd,
      environment: envVars,
      stdout: outputStream,
      stderr: outputStream,
    })

    const outputs = await readExecOutputs(log, tmpDir.path)

    // Comes from error object
    const shortMessage = (result as any).shortMessage || ""
    const outputLog = ((result.stdout || "") + "\n" + (result.stderr || "") + "\n" + shortMessage).trim()

    return {
      ...result,
      outputs: { ...outputs, log: outputLog, stdout: result.stdout, stderr: result.stderr },
      outputLog,
      completedAt: new Date(),
      success: result.exitCode === 0,
    }
  } finally {
    await tmpDir.cleanup()
  }
}

export async function readExecOutputs(log: Log, outputsPath: string) {
  const outputs: PrimitiveMap = {}

  if (!(await exists(outputsPath))) {
    log.warn(`Outputs directory ${outputsPath} does not exist, skipping`)
    return outputs
  }

  log.verbose(`Reading outputs from ${outputsPath}`)

  const outputsFiles = await readdir(outputsPath)

  if (outputsFiles.includes(execOutputsJsonFilename)) {
    const outputsJsonPath = join(outputsPath, execOutputsJsonFilename)

    log.verbose(`Reading JSON outputs from ${outputsJsonPath}`)
    const outputsJson = await readFile(outputsJsonPath, "utf8")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let outputsParsed: any = {}

    try {
      outputsParsed = JSON.parse(outputsJson)
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new RuntimeError({ message: `Outputs JSON file ${outputsJsonPath} is not a valid JSON object/map` })
      }
      throw err
    }

    if (!isPlainObject(outputsParsed)) {
      throw new RuntimeError({ message: `Outputs JSON file ${outputsJsonPath} is not a valid JSON object/map` })
    }

    for (const [key, value] of Object.entries(outputsParsed)) {
      if (disallowedOutputKeys.includes(key)) {
        log.warn(`Outputs JSON file ${outputsJsonPath} contains disallowed key '${key}', skipping`)
        continue
      }

      if (!key.match(outputKeyRegex)) {
        log.warn(`Outputs JSON file ${outputsJsonPath} contains invalid key '${key}', skipping`)
        continue
      }

      if (isPrimitive(value)) {
        outputs[key] = value
      } else {
        log.warn(`Outputs JSON file ${outputsJsonPath} contains non-primitive value for key '${key}', skipping`)
      }
    }
  }

  for (const filename of outputsFiles) {
    if (filename.startsWith(".")) {
      continue
    }

    if (disallowedOutputKeys.includes(filename)) {
      log.warn(`Outputs filename ${filename} is a disallowed key, skipping`)
      continue
    }

    if (!filename.match(outputKeyRegex)) {
      log.warn(`Outputs filename ${filename} is not a valid output key, skipping`)
      continue
    }

    const filePath = join(outputsPath, filename)

    if (await isDirectory(filePath)) {
      log.warn(`Outputs filename ${filename} is a directory, skipping`)
      continue
    }

    const fileContents = await readFile(filePath, "utf8")
    // Trim trailing newline (allowing other whitespace)
    outputs[filename] = fileContents.replace(/[\r|\n|\r\n]$/, "")
  }

  return outputs
}

export async function copyArtifacts(
  log: Log,
  artifacts: ArtifactSpec[] | undefined,
  from: string,
  artifactsPath: string
) {
  return Promise.all(
    (artifacts || []).map(async (spec) => {
      try {
        log.verbose(`→ Copying artifacts ${spec.source}`)

        // Note: lazy-loading for startup performance
        const { default: cpy } = await import("cpy")

        await cpy(`./${spec.source}`, join(artifactsPath, spec.target || "."), { cwd: from })
      } catch (err: unknown) {
        if (!(err instanceof Error)) {
          throw err
        }

        if (err.name === "CpyError") {
          throw new RuntimeError({ message: err.message })
        }

        throw err
      }
    })
  )
}

export const execGetResultHandler = async ({
  action,
  log,
  ctx,
}: {
  action: ResolvedExecAction
  log: Log
  ctx: PluginContext
}) => {
  const startedAt = new Date()
  const statusCommand = action.getSpec().statusCommand

  if (!statusCommand || statusCommand.length === 0) {
    return {
      state: "unknown" as ActionStatus["state"],
      detail: { runtime: ACTION_RUNTIME_LOCAL, startedAt, completedAt: new Date(), log: "", success: true },
      outputs: {},
    }
  }

  try {
    const result = await execRunCommand({ command: statusCommand, action, ctx, log })

    return {
      state: "ready" as const,
      detail: {
        runtime: ACTION_RUNTIME_LOCAL,
        log: result.outputLog,
        success: true,
        startedAt,
        completedAt: result.completedAt,
      },
      outputs: result.outputs,
    }
  } catch (err) {
    if (!isExpectedStatusCommandError(err)) {
      throw err
    }

    return {
      state: "not-ready" as const,
      detail: {
        runtime: ACTION_RUNTIME_LOCAL,
        startedAt,
        completedAt: new Date(),
        log: err.message,
        success: true,
      },
      outputs: {},
    }
  }
}

export function isExpectedStatusCommandError(err: unknown): err is Error {
  return err instanceof Error && !(isErrnoException(err) && (err.code === "EMFILE" || err.code === "ENOENT"))
}
