/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BinaryCmd } from "../../../util/ext-tools"
import { LogEntry } from "../../../logger/log-entry"
import { KubernetesPluginContext } from "../config"
import { getAppNamespace } from "../namespace"
import { join } from "path"
import { GARDEN_GLOBAL_PATH } from "../../../constants"
import { mkdirp } from "fs-extra"

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
      url: "https://get.helm.sh/helm-v3.0.1-darwin-amd64.tar.gz",
      sha256: "4bffac2b5710fe80d2987efbc046a25968dbf3fb981c499e82fc21fe6178d2f3",
      extract: {
        format: "tar",
        targetPath: ["darwin-amd64", "helm"],
      },
    },
    linux: {
      url: "https://get.helm.sh/helm-v3.0.1-linux-amd64.tar.gz",
      sha256: "6de3337bb7683fd62f915d156cfc13c1cf73dc183bd39f2fb4644498c7595805",
      extract: {
        format: "tar",
        targetPath: ["linux-amd64", "helm"],
      },
    },
    win32: {
      url: "https://get.helm.sh/helm-v3.0.1-windows-amd64.zip",
      sha256: "60edef2180f94884e6a985c5cf920242fcc3fe8712f2d9768187b14816ed6bd9",
      extract: {
        format: "zip",
        targetPath: ["windows-amd64", "helm.exe"],
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
}: {
  ctx: KubernetesPluginContext
  namespace?: string
  log: LogEntry
  args: string[]
  version?: 2 | 3
}) {
  if (!namespace) {
    namespace = await getAppNamespace(ctx, log, ctx.provider)
  }

  const opts = ["--kube-context", ctx.provider.config.context]

  if (version === 2) {
    opts.push("--tiller-namespace", namespace)
  } else {
    opts.push("--namespace", namespace)
  }

  if (ctx.provider.config.kubeconfig) {
    opts.push("--kubeconfig", ctx.provider.config.kubeconfig)
  }

  const helmHome = join(GARDEN_GLOBAL_PATH, ".helm")
  await mkdirp(helmHome)

  const cmd = version === 2 ? helm2 : helm3

  return cmd.stdout({
    log,
    args: [...opts, ...args],
    env: {
      HELM_HOME: helmHome,
    },
    // Helm itself will time out pretty reliably, so we shouldn't time out early on our side.
    timeout: 3600,
  })
}
