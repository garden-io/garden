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
import { resolve } from "path"
import { naturalList } from "../../../util/string.js"

export const helmVersion = "3.14.4"

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
      sha256: "73434aeac36ad068ce2e5582b8851a286dc628eae16494a26e2ad0b24a7199f9",
      extract: {
        format: "tar",
        targetPath: "darwin-amd64/helm",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://get.helm.sh/helm-v${helmVersion}-darwin-arm64.tar.gz`,
      sha256: "61e9c5455f06b2ad0a1280975bf65892e707adc19d766b0cf4e9006e3b7b4b6c",
      extract: {
        format: "tar",
        targetPath: "darwin-arm64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${helmVersion}-linux-amd64.tar.gz`,
      sha256: "a5844ef2c38ef6ddf3b5a8f7d91e7e0e8ebc39a38bb3fc8013d629c1ef29c259",
      extract: {
        format: "tar",
        targetPath: "linux-amd64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://get.helm.sh/helm-v${helmVersion}-linux-arm64.tar.gz`,
      sha256: "113ccc53b7c57c2aba0cd0aa560b5500841b18b5210d78641acfddc53dac8ab2",
      extract: {
        format: "tar",
        targetPath: "linux-arm64/helm",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://get.helm.sh/helm-v${helmVersion}-windows-amd64.zip`,
      sha256: "0b951db3eadd92dfe336b5a9ddb0640e5cd70d39abdbd7d3125e9fb59b22b669",
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

  return cmd
    .stdout({
      log,
      args: [...opts, ...args],
      env: envVars,
      // Helm itself will time out pretty reliably, so we shouldn't time out early on our side.
      timeoutSec: 3600,
      cwd,
      stderr: outputStream,
      stdout: outputStream,
    })
    .catch((err) => {
      // handle special case when `helm install` command fails with confusing error message
      if (err.message.includes("INSTALLATION FAILED: Chart.yaml file is missing")) {
        log.warn(
          `It might be that the Helm chart name defined in the arguments list [${naturalList(args)}] conflicts with one of the directory names in the current working directory: ${cwd || resolve(".")}. Consider renaming the directory with the conflicting name.`
        )
      }
      throw err
    })
}
