/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../../../logger/log-entry"
import { KubernetesPluginContext } from "../config"
import { StringMap } from "../../../config/common"
import { PluginToolSpec } from "../../../types/plugin/tools"
import split2 from "split2"
import { LogLevel } from "../../../logger/logger"
import { Dictionary, pickBy } from "lodash"

export const HELM_VERSION = "3.12.2"

export const helm3Spec: PluginToolSpec = {
  name: "helm",
  description: `The Helm CLI (version ${HELM_VERSION}).`,
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${HELM_VERSION}-darwin-amd64.tar.gz`,
      sha256: "6e8bfc84a640e0dc47cc49cfc2d0a482f011f4249e2dff2a7e23c7ef2df1b64e",
      extract: {
        format: "tar",
        targetPath: "darwin-amd64/helm",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://get.helm.sh/helm-v${HELM_VERSION}-darwin-arm64.tar.gz`,
      sha256: "b60ee16847e28879ae298a20ba4672fc84f741410f438e645277205824ddbf55",
      extract: {
        format: "tar",
        targetPath: "darwin-arm64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${HELM_VERSION}-linux-amd64.tar.gz`,
      sha256: "2b6efaa009891d3703869f4be80ab86faa33fa83d9d5ff2f6492a8aebe97b219",
      extract: {
        format: "tar",
        targetPath: "linux-amd64/helm",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${HELM_VERSION}-windows-amd64.zip`,
      sha256: "35dc439baad85728dafd2be0edd4721ae5b770c5cf72c3adf9558b1415a9cae6",
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
  log: LogEntry
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
    log: log.placeholder({ level: LogLevel.verbose }),
  }

  const outputStream = split2()
  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    if (emitLogEvents) {
      ctx.events.emit("log", { timestamp: new Date().toISOString(), data: line, ...logEventContext })
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
