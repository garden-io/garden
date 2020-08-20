/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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
      url: "https://get.helm.sh/helm-v3.2.1-darwin-amd64.tar.gz",
      sha256: "983c4f167060b3892a42f353c7891cabac36ec49f6042eae1046bd8a258b8a14",
      extract: {
        format: "tar",
        targetPath: "darwin-amd64/helm",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.2.1-linux-amd64.tar.gz",
      sha256: "018f9908cb950701a5d59e757653a790c66d8eda288625dbb185354ca6f41f6b",
      extract: {
        format: "tar",
        targetPath: "linux-amd64/helm",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://get.helm.sh/helm-v3.2.1-windows-amd64.zip",
      sha256: "dbd30c03f5ba110348a20ffb5ed8770080757937c157987cce59287507af79dd",
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
