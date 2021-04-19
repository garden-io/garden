/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../../../logger/log-entry"
import { KubernetesPluginContext } from "../config"
import { join } from "path"
import { GARDEN_GLOBAL_PATH } from "../../../constants"
import { mkdirp } from "fs-extra"
import { StringMap } from "../../../config/common"
import { PluginToolSpec } from "../../../types/plugin/tools"

export const helm3Spec: PluginToolSpec = {
  name: "helm",
  description: "The Helm CLI (version 3.x).",
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.5.4-darwin-amd64.tar.gz",
      sha256: "072c40c743d30efdb8231ca03bab55caee7935e52175e42271a0c3bc37ec0b7b",
      extract: {
        format: "tar",
        targetPath: "darwin-amd64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.5.4-linux-amd64.tar.gz",
      sha256: "a8ddb4e30435b5fd45308ecce5eaad676d64a5de9c89660b56face3fe990b318",
      extract: {
        format: "tar",
        targetPath: "linux-amd64/helm",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.5.4-windows-amd64.zip",
      sha256: "830da2a8fba060ceff95486b3166b11c517035092e213f8d775be4ae2f7c13e0",
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
}: {
  ctx: KubernetesPluginContext
  namespace?: string
  log: LogEntry
  args: string[]
  version?: 2 | 3
  env?: { [key: string]: string }
  cwd?: string
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

  return cmd.stdout({
    log,
    args: [...opts, ...args],
    env: envVars,
    // Helm itself will time out pretty reliably, so we shouldn't time out early on our side.
    timeoutSec: 3600,
    cwd,
  })
}
