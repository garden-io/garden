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

export const helmVersion = "3.15.1"

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
      sha256: "5fdc60e090d183113f9fa0ae9dd9d12f0c1462b9ded286370f84e340f84bd676",
      extract: {
        format: "tar",
        targetPath: "darwin-amd64/helm",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://get.helm.sh/helm-v${helmVersion}-darwin-arm64.tar.gz`,
      sha256: "4b04ede5ab9bb226c9b198c94ce12818f0b0e302193defd66970b45fc341f6e7",
      extract: {
        format: "tar",
        targetPath: "darwin-arm64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${helmVersion}-linux-amd64.tar.gz`,
      sha256: "7b20e7791c04ea71e7fe0cbe11f1a8be4a55a692898b57d9db28f3b0c1d52f11",
      extract: {
        format: "tar",
        targetPath: "linux-amd64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://get.helm.sh/helm-v${helmVersion}-linux-arm64.tar.gz`,
      sha256: "b4c5519b18f01dd2441f5e09497913dc1da1a1eec209033ae792a8d45b9e0e86",
      extract: {
        format: "tar",
        targetPath: "linux-arm64/helm",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${helmVersion}-windows-amd64.zip`,
      sha256: "8ebe6d353f0fbc7e51861a676ba1c14af9efb3443ae2c78eb91946a756b93a9a",
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
