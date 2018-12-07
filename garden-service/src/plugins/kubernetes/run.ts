/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RunResult } from "../../types/plugin/outputs"
import { kubectl } from "./kubectl"
import { PrimitiveMap } from "../../config/common"
import { Module } from "../../types/module"

interface RunPodParams {
  context: string,
  namespace: string,
  module: Module,
  image: string,
  envVars: PrimitiveMap,
  args: string[],
  interactive: boolean,
  ignoreError: boolean,
  timeout?: number,
}

export async function runPod(
  { context, namespace, module, image, envVars, args, interactive, ignoreError, timeout }: RunPodParams,
): Promise<RunResult> {
  const envArgs = Object.entries(envVars).map(([k, v]) => `--env=${k}=${v}`)

  const commandStr = args.join(" ")

  const opts = [
    `--image=${image}`,
    "--restart=Never",
    "--command",
    "--quiet",
    "--rm",
    // Need to attach to get the log output and exit code.
    "-i",
  ]

  if (interactive) {
    opts.push("--tty")
  }

  const kubecmd = [
    "run", `run-${module.name}-${Math.round(new Date().getTime())}`,
    ...opts,
    ...envArgs,
    "--",
    "/bin/sh",
    "-c",
    commandStr,
  ]

  const startedAt = new Date()

  const res = await kubectl(context, namespace).call(kubecmd, {
    ignoreError,
    timeout,
    tty: interactive,
  })

  return {
    moduleName: module.name,
    command: args,
    version: module.version,
    startedAt,
    completedAt: new Date(),
    output: res.output,
    success: res.code === 0,
  }
}
