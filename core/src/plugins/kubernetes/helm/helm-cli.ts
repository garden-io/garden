/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import type { KubernetesPluginContext } from "../config.js"
import type { StringMap } from "../../../config/common.js"
import type { PluginToolSpec } from "../../../plugin/tools.js"
import type { Dictionary } from "../../../util/util.js"
import split2 from "split2"
import { pickBy } from "lodash-es"

export const helmVersion = "3.15.2"

export const helm3Spec: PluginToolSpec = {
  name: "helm",
  description: `The Helm CLI, v${helmVersion}`,
  version: helmVersion,
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${helmVersion}-darwin-amd64.tar.gz`,
      sha256: "e99a9266a5328cb575d81ef10247911f42d9e90c76ef6eef154c5c535565658b",
      extract: {
        format: "tar",
        targetPath: "darwin-amd64/helm",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://get.helm.sh/helm-v${helmVersion}-darwin-arm64.tar.gz`,
      sha256: "30143dabc1da9d32c7d6c589fad04b1f1ecc73841393d5823fa21c5d7f5bf8f6",
      extract: {
        format: "tar",
        targetPath: "darwin-arm64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${helmVersion}-linux-amd64.tar.gz`,
      sha256: "2694b91c3e501cff57caf650e639604a274645f61af2ea4d601677b746b44fe2",
      extract: {
        format: "tar",
        targetPath: "linux-amd64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://get.helm.sh/helm-v${helmVersion}-linux-arm64.tar.gz`,
      sha256: "adcf07b08484b52508e5cbc8b5f4b0b0db50342f7bc487ecd88b8948b680e6a7",
      extract: {
        format: "tar",
        targetPath: "linux-arm64/helm",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${helmVersion}-windows-amd64.zip`,
      sha256: "cbf40b79fa2a7dbd6e24201f8660b56261d10d6e7b5cadc3ff78100fb45b3c69",
      extract: {
        format: "zip",
        targetPath: "windows-amd64/helm.exe",
      },
    },
  ],
}

export async function helm({
  ctx,
  namespace,
  log,
  args,
  env = {},
  cwd,
  emitLogEvents,
}: {
  ctx: KubernetesPluginContext
  namespace?: string
  log: Log
  args: string[]
  env?: { [key: string]: string }
  cwd?: string
  emitLogEvents: boolean
}) {
  const opts = ["--kube-context", ctx.provider.config.context]

  if (ctx.provider.config.kubeconfig) {
    opts.push("--kubeconfig", ctx.provider.config.kubeconfig)
  }

  const cmd = ctx.tools["kubernetes.helm"]

  const processEnv = pickBy(process.env, (v) => v !== undefined) as Dictionary<string>
  const envVars: StringMap = {
    ...processEnv,
    ...env,
  }

  if (namespace) {
    opts.push("--namespace", namespace)
  }

  const logEventContext = {
    origin: "helm",
    level: "verbose" as const,
  }

  const outputStream = split2()
  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    if (emitLogEvents) {
      ctx.events.emit("log", { timestamp: new Date().toISOString(), msg: line.toString(), ...logEventContext })
    }
  })

  return cmd.stdout({
    log,
    args: [...opts, ...args],
    env: envVars,
    // Helm itself will time out pretty reliably, so we shouldn't time out early on our side.
    timeoutSec: 3600,
    cwd,
    stderr: outputStream,
    stdout: outputStream,
  })
}
