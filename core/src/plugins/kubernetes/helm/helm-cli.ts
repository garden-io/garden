/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
      url: "https://get.helm.sh/helm-v3.7.2-darwin-amd64.tar.gz",
      sha256: "5a0738afb1e194853aab00258453be8624e0a1d34fcc3c779989ac8dbcd59436",
      extract: {
        format: "tar",
        targetPath: "darwin-amd64/helm",
      },
    },
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.7.2-darwin-arm64.tar.gz",
      sha256: "260d4b8bffcebc6562ea344dfe88efe252cf9511dd6da3cccebf783773d42aec",
      extract: {
        format: "tar",
        targetPath: "darwin-arm64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.7.2-linux-amd64.tar.gz",
      sha256: "4ae30e48966aba5f807a4e140dad6736ee1a392940101e4d79ffb4ee86200a9e",
      extract: {
        format: "tar",
        targetPath: "linux-amd64/helm",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.7.2-windows-amd64.zip",
      sha256: "299165f0af46bece9a61b41305cca8e8d5ec5319a4b694589cd71e6b75aca77e",
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
