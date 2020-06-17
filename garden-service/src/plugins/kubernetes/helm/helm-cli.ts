/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BinaryCmd } from "../../../util/ext-tools"
import { LogEntry } from "../../../logger/log-entry"
import { KubernetesPluginContext } from "../config"
import { join } from "path"
import { GARDEN_GLOBAL_PATH } from "../../../constants"
import { mkdirp } from "fs-extra"
import { StringMap } from "../../../config/common"

const helm2 = new BinaryCmd({
  name: "helm2",
  specs: {
    darwin: {
      url: "https://storage.googleapis.com/kubernetes-helm/helm-v2.14.1-darwin-amd64.tar.gz",
      sha256: "392ec847ecc5870a48a39cb0b8d13c8aa72aaf4365e0315c4d7a2553019a451c",
      extract: {
        format: "tar",
        targetPath: ["darwin-amd64", "helm"],
      },
    },
    linux: {
      url: "https://storage.googleapis.com/kubernetes-helm/helm-v2.14.1-linux-amd64.tar.gz",
      sha256: "804f745e6884435ef1343f4de8940f9db64f935cd9a55ad3d9153d064b7f5896",
      extract: {
        format: "tar",
        targetPath: ["linux-amd64", "helm"],
      },
    },
    win32: {
      url: "https://storage.googleapis.com/kubernetes-helm/helm-v2.14.1-windows-amd64.zip",
      sha256: "2c833d9625d3713b625255043151e82969382ef05b48d1ac270f876eb774f325",
      extract: {
        format: "zip",
        targetPath: ["windows-amd64", "helm.exe"],
      },
    },
  },
})

const helm3 = new BinaryCmd({
  name: "helm3",
  specs: {
    darwin: {
      url: "https://get.helm.sh/helm-v3.2.1-darwin-amd64.tar.gz",
      sha256: "983c4f167060b3892a42f353c7891cabac36ec49f6042eae1046bd8a258b8a14",
      extract: {
        format: "tar",
        targetPath: ["darwin-amd64", "helm"],
      },
    },
    linux: {
      url: "https://get.helm.sh/helm-v3.2.1-linux-amd64.tar.gz",
      sha256: "018f9908cb950701a5d59e757653a790c66d8eda288625dbb185354ca6f41f6b",
      extract: {
        format: "tar",
        targetPath: ["linux-amd64", "helm"],
      },
    },
    win32: {
      url: "https://get.helm.sh/helm-v3.2.1-windows-amd64.zip",
      sha256: "dbd30c03f5ba110348a20ffb5ed8770080757937c157987cce59287507af79dd",
      extract: {
        format: "zip",
        targetPath: ["windows-amd64", "helm.exe"],
      },
    },
  },
})

export const helmPlugin2to3 = new BinaryCmd({
  name: "helm-plugin-2to3",
  specs: {
    darwin: {
      url: "https://github.com/helm/helm-2to3/releases/download/v0.2.1/helm-2to3_0.2.1_darwin_amd64.tar.gz",
      sha256: "b0ab2f81da90aa3d53731784a4c93ceb5c316d86098425aac0f09c8014acc2c1",
      extract: {
        format: "tar",
        targetPath: ["2to3"],
      },
    },
    linux: {
      url: "https://github.com/helm/helm-2to3/releases/download/v0.2.1/helm-2to3_0.2.1_linux_amd64.tar.gz",
      sha256: "f90c6cc3f4670be71d89d2f74739f53fd4b1b190d4b1dd4af5fa8002978a41f6",
      extract: {
        format: "tar",
        targetPath: ["2to3"],
      },
    },
    win32: {
      url: "https://github.com/helm/helm-2to3/releases/download/v0.2.1/helm-2to3_0.2.1_windows_amd64.tar.gz",
      sha256: "01b2671103b05b6b0d698dbec89ea09ee99d83380fc70c1e89324b2c8615cd0f",
      extract: {
        format: "tar",
        targetPath: ["2to3.exe"],
      },
    },
  },
})

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

  const cmd = version === 2 ? helm2 : helm3

  const envVars: StringMap = {
    ...process.env,
    ...env,
    HELM_HOME: helmHome,
  }

  if (namespace) {
    if (version === 2) {
      opts.push("--tiller-namespace", namespace)
      envVars.TILLER_NAMESPACE = namespace
    } else {
      opts.push("--namespace", namespace)
    }
  }

  return cmd.stdout({
    log,
    args: [...opts, ...args],
    env: envVars,
    // Helm itself will time out pretty reliably, so we shouldn't time out early on our side.
    timeout: 3600,
    cwd,
  })
}
