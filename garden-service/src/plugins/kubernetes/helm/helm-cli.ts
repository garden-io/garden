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
      url: "https://get.helm.sh/helm-v3.0.2-darwin-amd64.tar.gz",
      sha256: "05c7748da0ea8d5f85576491cd3c615f94063f20986fd82a0f5658ddc286cdb1",
      extract: {
        format: "tar",
        targetPath: ["darwin-amd64", "helm"],
      },
    },
    linux: {
      url: "https://get.helm.sh/helm-v3.0.2-linux-amd64.tar.gz",
      sha256: "c6b7aa7e4ffc66e8abb4be328f71d48c643cb8f398d95c74d075cfb348710e1d",
      extract: {
        format: "tar",
        targetPath: ["linux-amd64", "helm"],
      },
    },
    win32: {
      url: "https://get.helm.sh/helm-v3.0.2-windows-amd64.zip",
      sha256: "b76dabf4e25166ebf1db7337145b02cc986fcfcee06e195df983c39c36722f46",
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
}: {
  ctx: KubernetesPluginContext
  namespace?: string
  log: LogEntry
  args: string[]
  version?: 2 | 3
  env?: { [key: string]: string }
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

  const helmHome = join(GARDEN_GLOBAL_PATH, `.helm${version}`)
  await mkdirp(helmHome)

  const cmd = version === 2 ? helm2 : helm3

  return cmd.stdout({
    log,
    args: [...opts, ...args],
    env: {
      ...process.env,
      ...env,
      HELM_HOME: helmHome,
      TILLER_NAMESPACE: namespace,
    },
    // Helm itself will time out pretty reliably, so we shouldn't time out early on our side.
    timeout: 3600,
  })
}
