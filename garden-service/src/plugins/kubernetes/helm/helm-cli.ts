/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BinaryCmd } from "../../../util/ext-tools"
import { LogEntry } from "../../../logger/log-entry"

const helmCmd = new BinaryCmd({
  name: "helm",
  specs: {
    darwin: {
      url: "https://storage.googleapis.com/kubernetes-helm/helm-v2.13.0-darwin-amd64.tar.gz",
      sha256: "166318b2159613f87a7cb02af1614c96244b3d3c119f8e010429c1b4449681d5",
      extract: {
        format: "tar",
        executablePath: ["darwin-amd64", "helm"],
      },
    },
    linux: {
      url: "https://storage.googleapis.com/kubernetes-helm/helm-v2.13.0-linux-amd64.tar.gz",
      sha256: "15eca6ad225a8279de80c7ced42305e24bc5ac60bb7d96f2d2fa4af86e02c794",
      extract: {
        format: "tar",
        executablePath: ["linux-amd64", "helm"],
      },
    },
    win32: {
      url: "https://storage.googleapis.com/kubernetes-helm/helm-v2.13.0-windows-amd64.zip",
      sha256: "63fdb71ad6fac0572a21ad81da7508b1f0cae960ea944670f4d2f7fbaf23acb2",
      extract: {
        format: "zip",
        executablePath: ["windows-amd64", "helm.exe"],
      },
    },
  },
})

export async function helm(namespace: string, context: string, log: LogEntry, ...args: string[]) {
  args = [
    "--tiller-namespace", namespace,
    "--kube-context", context,
    ...args,
  ]

  return helmCmd.stdout({
    log,
    args,
  })
}
