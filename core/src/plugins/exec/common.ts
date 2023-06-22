/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { mapValues } from "lodash"
import { join } from "path"
import split2 = require("split2")
import { PrimitiveMap } from "../../config/common"
import { ArtifactSpec } from "../../config/validation"
import { exec, ExecOpts } from "../../util/util"
import { Log } from "../../logger/log-entry"
import { PluginContext } from "../../plugin-context"
import { ResolvedExecAction } from "./config"

export function getDefaultEnvVars(action: ResolvedExecAction) {
  return {
    ...process.env,
    // Workaround for https://github.com/vercel/pkg/issues/897
    PKG_EXECPATH: "",
    ...action.getEnvVars(),
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

export async function execRun({
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
  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    log.verbose(line.toString())
    ctx.events.emit("log", { timestamp: new Date().toISOString(), msg: line.toString(), ...logEventContext })
  })

  const envVars = {
    ...getDefaultEnvVars(action),
    ...(env ? mapValues(env, (v) => v + "") : {}),
  }

  const shell = !!action.getSpec().shell
  const { cmd, args } = convertCommandSpec(command, shell)

  log.debug(`Running command: ${cmd}`)

  return exec(cmd, args, {
    ...opts,
    shell,
    cwd: action.getBuildPath(),
    env: envVars,
    stdout: outputStream,
    stderr: outputStream,
  })
}

export async function copyArtifacts(
  log: Log,
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
