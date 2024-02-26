/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
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

export const helmVersion = "3.14.0"

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
      sha256: "804586896496f7b3da97f56089ea00f220e075e969b6fdf6c0b7b9cdc22de120",
      extract: {
        format: "tar",
        targetPath: "darwin-amd64/helm",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://get.helm.sh/helm-v${helmVersion}-darwin-arm64.tar.gz`,
      sha256: "c2f36f3289a01c7c93ca11f84d740a170e0af1d2d0280bd523a409a62b8dfa1d",
      extract: {
        format: "tar",
        targetPath: "darwin-arm64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${helmVersion}-linux-amd64.tar.gz`,
      sha256: "f43e1c3387de24547506ab05d24e5309c0ce0b228c23bd8aa64e9ec4b8206651",
      extract: {
        format: "tar",
        targetPath: "linux-amd64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://get.helm.sh/helm-v${helmVersion}-linux-arm64.tar.gz`,
      sha256: "b29e61674731b15f6ad3d1a3118a99d3cc2ab25a911aad1b8ac8c72d5a9d2952",
      extract: {
        format: "tar",
        targetPath: "linux-arm64/helm",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${helmVersion}-windows-amd64.zip`,
      sha256: "fa8dfb5141e7a200fcc6ee290554697072a4584791b4fece4b9c60af501f3512",
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
