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

const helmCmd = new BinaryCmd({
  name: "helm",
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

export async function helm({
  ctx,
  namespace,
  log,
  args,
}: {
  ctx: KubernetesPluginContext
  namespace?: string
  log: LogEntry
  args: string[]
}) {
  if (!namespace) {
    namespace = await getAppNamespace(ctx, log, ctx.provider)
  }

  const opts = ["--tiller-namespace", namespace, "--kube-context", ctx.provider.config.context]

  if (ctx.provider.config.kubeconfig) {
    opts.push("--kubeconfig", ctx.provider.config.kubeconfig)
  }

  return helmCmd.stdout({
    log,
    args: [...opts, ...args],
    // Helm itself will time out pretty reliably, so we shouldn't time out early on our side.
    timeout: 3600,
  })
}
