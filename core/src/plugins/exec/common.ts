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
import type { ArtifactSpec } from "../../config/validation.js"
import type { ExecOpts } from "../../util/util.js"
import { exec } from "../../util/util.js"
import type { Log } from "../../logger/log-entry.js"
import type { PluginContext } from "../../plugin-context.js"
import type { ResolvedExecAction } from "./config.js"
import { RuntimeError } from "../../exceptions.js"

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

  const envVars = {
    ...getDefaultEnvVars(action, log),
    ...(env ? mapValues(env, (v) => v + "") : {}),
  }

  const shell = !!action.getSpec().shell
  const { cmd, args } = convertCommandSpec(command, shell)

  log.debug(`Running command: ${cmd}`)

  const result = await exec(cmd, args, {
    ...opts,
    shell,
    cwd: action.getBuildPath(),
    environment: envVars,
    stdout: outputStream,
    stderr: outputStream,
  })

  // Comes from error object
  const shortMessage = (result as any).shortMessage || ""

  return {
    ...result,
    outputLog: ((result.stdout || "") + "\n" + (result.stderr || "") + "\n" + shortMessage).trim(),
    completedAt: new Date(),
    success: result.exitCode === 0,
  }
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
