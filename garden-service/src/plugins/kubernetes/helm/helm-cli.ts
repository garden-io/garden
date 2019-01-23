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
      url: "https://storage.googleapis.com/kubernetes-helm/helm-v2.11.0-darwin-amd64.tar.gz",
      sha256: "551b13a398749ae3e0a5c54d3078f6e3bee552c5d6a0bf6f338cab64ce38ab0f",
      extract: {
        format: "tar",
        executablePath: ["darwin-amd64", "helm"],
      },
    },
    linux: {
      url: "https://storage.googleapis.com/kubernetes-helm/helm-v2.11.0-linux-amd64.tar.gz",
      sha256: "02a4751586d6a80f6848b58e7f6bd6c973ffffadc52b4c06652db7def02773a1",
      extract: {
        format: "tar",
        executablePath: ["linux-amd64", "helm"],
      },
    },
    win32: {
      url: "https://storage.googleapis.com/kubernetes-helm/helm-v2.11.0-windows-amd64.zip",
      sha256: "04dd84691f18170a82b02656cd1ec9f32c5a66893abe5498b4ea63c941eae12a",
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
