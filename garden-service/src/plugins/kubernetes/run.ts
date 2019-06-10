/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RunResult } from "../../types/plugin/base"
import { kubectl } from "./kubectl"
import { PrimitiveMap } from "../../config/common"
import { Module } from "../../types/module"
import { LogEntry } from "../../logger/log-entry"

interface RunPodParams {
  args: string[],
  context: string,
  envVars: PrimitiveMap,
  ignoreError: boolean,
  image: string,
  interactive: boolean,
  log: LogEntry,
  module: Module,
  namespace: string,
  overrides?: any,
  timeout?: number,
}

// TODO: stop using kubectl for this, run the Pod directly or at least create via API and only attach via kubectl
export async function runPod(
  {
    args,
    context,
    envVars,
    ignoreError,
    image,
    interactive,
    log,
    module,
    namespace,
    overrides,
    timeout,
  }: RunPodParams,
): Promise<RunResult> {
  const opts = [
    `--image=${image}`,
    "--restart=Never",
    "--command",
    "--quiet",
    "--rm",
    // Need to attach to get the log output and exit code.
    "-i",
  ]

  if (overrides) {
    opts.push("--overrides", `${JSON.stringify(overrides)}`)
  }

  if (interactive) {
    opts.push("--tty")
  }

  const envArgs = Object.entries(envVars).map(([k, v]) => `--env=${k}=${v}`)

  const kubecmd = [
    "run", `run-${module.name}-${Math.round(new Date().getTime())}`,
    ...opts,
    ...envArgs,
    "--",
    ...args,
  ]

  log.verbose(`Running kubectl ${args.join(" ")}`)

  const startedAt = new Date()

  const res = await kubectl.spawnAndWait({
    log,
    context,
    namespace,
    ignoreError,
    args: kubecmd,
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
