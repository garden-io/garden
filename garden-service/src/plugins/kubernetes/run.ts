/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RunResult } from "../../types/plugin/base"
import { kubectl } from "./kubectl"
import { Module } from "../../types/module"
import { LogEntry } from "../../logger/log-entry"
import { V1PodSpec } from "@kubernetes/client-node"
import { PluginError } from "../../exceptions"
import { KubernetesProvider } from "./config"
import { Writable } from "stream"

interface RunPodParams {
  provider: KubernetesProvider
  image: string
  interactive: boolean
  ignoreError: boolean
  log: LogEntry
  module: Module
  namespace: string
  annotations?: { [key: string]: string }
  spec: V1PodSpec
  outputStream?: Writable
  podName?: string
  timeout?: number
}

export async function runPod({
  provider,
  ignoreError,
  image,
  interactive,
  log,
  module,
  namespace,
  annotations,
  spec,
  outputStream,
  podName,
  timeout,
}: RunPodParams): Promise<RunResult> {
  const overrides: any = {
    metadata: {
      annotations: {
        // Workaround to make sure sidecars are not injected,
        // due to https://github.com/kubernetes/kubernetes/issues/25908
        "sidecar.istio.io/inject": "false",
        ...(annotations || {}),
      },
    },
    spec,
  }

  if (!spec.containers || spec.containers.length === 0) {
    throw new PluginError(`Pod spec for runPod must contain at least one container`, {
      spec,
    })
  }

  if (interactive) {
    spec.containers[0].stdin = true
    spec.containers[0].stdinOnce = true
    spec.containers[0].tty = true
  }

  const runPodName = podName || `run-${module.name}-${Math.round(new Date().getTime())}`

  const kubecmd = [
    "run",
    runPodName,
    `--image=${image}`,
    "--restart=Never",
    "--rm",
    // Need to attach to get the log output and exit code.
    "-i",
    // This is a little messy, but it works...
    "--overrides",
    `${JSON.stringify(overrides)}`,
  ]

  if (interactive) {
    kubecmd.push("--tty")
  } else {
    kubecmd.push("--quiet")
  }

  const command = [...(spec.containers[0].command || []), ...(spec.containers[0].args || [])]
  log.verbose(`Running '${command.join(" ")}' in Pod ${runPodName}`)

  const startedAt = new Date()

  const res = await kubectl.spawnAndWait({
    log,
    provider,
    namespace,
    ignoreError,
    args: kubecmd,
    outputStream,
    timeout,
    tty: interactive,
  })

  return {
    moduleName: module.name,
    command,
    version: module.version.versionString,
    startedAt,
    completedAt: new Date(),
    log: res.output,
    success: res.code === 0,
  }
}
