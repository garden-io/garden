/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Log } from "../../../logger/log-entry"
import { KubernetesPluginContext } from "../config"
import { join } from "path"
import { GARDEN_GLOBAL_PATH } from "../../../constants"
import { mkdirp } from "fs-extra"
import { StringMap } from "../../../config/common"
import { PluginToolSpec } from "../../../plugin/tools"
import split2 from "split2"

export const helm3Spec: PluginToolSpec = {
  name: "helm",
  description: "The Helm CLI (version 3.x).",
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.11.2-darwin-amd64.tar.gz",
      sha256: "404938fd2c6eff9e0dab830b0db943fca9e1572cd3d7ee40904705760faa390f",
      extract: {
        format: "tar",
        targetPath: "darwin-amd64/helm",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: "https://get.helm.sh/helm-v3.11.2-darwin-arm64.tar.gz",
      sha256: "f61a3aa55827de2d8c64a2063fd744b618b443ed063871b79f52069e90813151",
      extract: {
        format: "tar",
        targetPath: "darwin-arm64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.11.2-linux-amd64.tar.gz",
      sha256: "781d826daec584f9d50a01f0f7dadfd25a3312217a14aa2fbb85107b014ac8ca",
      extract: {
        format: "tar",
        targetPath: "linux-amd64/helm",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.11.2-windows-amd64.zip",
      sha256: "bca0c5b99a0e6621032f1767e61a1723b86c5f4ef565fa58be8be6d619a4276a",
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
  version = 3,
  env = {},
  cwd,
  emitLogEvents,
}: {
  ctx: KubernetesPluginContext
  namespace?: string
  log: Log
  args: string[]
  version?: 2 | 3
  env?: { [key: string]: string }
  cwd?: string
  emitLogEvents: boolean
}) {
  const opts = ["--kube-context", ctx.provider.config.context]

  if (ctx.provider.config.kubeconfig) {
    opts.push("--kubeconfig", ctx.provider.config.kubeconfig)
  }

  const helmHome = join(GARDEN_GLOBAL_PATH, `.helm${version}`)
  await mkdirp(helmHome)

  const cmd = ctx.tools["kubernetes.helm"]

  const envVars: StringMap = {
    ...process.env,
    ...env,
    HELM_HOME: helmHome,
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
