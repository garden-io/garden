/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import _spawn from "cross-spawn"
import { encodeYamlMulti } from "../../util/util"
import { ExecParams, PluginTool } from "../../util/ext-tools"
import { LogEntry } from "../../logger/log-entry"
import { KubernetesProvider } from "./config"
import { KubernetesResource } from "./types"
import { gardenAnnotationKey } from "../../util/string"
import { hashManifest } from "./util"
import { PluginToolSpec } from "../../types/plugin/tools"
import { PluginContext } from "../../plugin-context"

export interface ApplyParams {
  log: LogEntry
  ctx: PluginContext
  provider: KubernetesProvider
  manifests: KubernetesResource[]
  namespace?: string
  dryRun?: boolean
  pruneSelector?: string
  validate?: boolean
}

export const KUBECTL_DEFAULT_TIMEOUT = 300

export async function apply({
  log,
  ctx,
  provider,
  manifests,
  dryRun = false,
  namespace,
  pruneSelector,
  validate = true,
}: ApplyParams) {
  // Hash the raw input and add as an annotation on each manifest (this is helpful beyond kubectl's own annotation,
  // because kubectl applies some normalization/transformation that is sometimes difficult to reason about).
  // Hashing the input prevents "Too long annotation..." errors.
  for (const manifest of manifests) {
    if (!manifest.metadata.annotations) {
      manifest.metadata.annotations = {}
    }
    if (manifest.metadata.annotations[gardenAnnotationKey("manifest-hash")]) {
      delete manifest.metadata.annotations[gardenAnnotationKey("manifest-hash")]
    }
    manifest.metadata.annotations[gardenAnnotationKey("manifest-hash")] = await hashManifest(manifest)
  }

  const input = Buffer.from(encodeYamlMulti(manifests))

  let args = ["apply"]
  dryRun && args.push("--dry-run")
  pruneSelector && args.push("--prune", "--selector", pruneSelector)
  args.push("--output=json", "-f", "-")
  !validate && args.push("--validate=false")

  const result = await kubectl(ctx, provider).stdout({ log, namespace, args, input })

  try {
    return JSON.parse(result)
  } catch (_) {
    return result
  }
}

export async function deleteResources({
  log,
  ctx,
  provider,
  namespace,
  resources,
  includeUninitialized = false,
}: {
  log: LogEntry
  ctx: PluginContext
  provider: KubernetesProvider
  namespace: string
  resources: KubernetesResource[]
  includeUninitialized?: boolean
}) {
  const args = [
    "delete",
    "--wait=true",
    "--ignore-not-found=true",
    ...resources.map((r) => `${r.kind}/${r.metadata.name}`),
  ]

  includeUninitialized && args.push("--include-uninitialized")

  return kubectl(ctx, provider).stdout({ namespace, args, log })
}

export async function deleteObjectsBySelector({
  log,
  ctx,
  provider,
  namespace,
  selector,
  objectTypes,
  includeUninitialized = false,
}: {
  log: LogEntry
  ctx: PluginContext
  provider: KubernetesProvider
  namespace: string
  selector: string
  objectTypes: string[]
  includeUninitialized?: boolean
}) {
  let args = ["delete", objectTypes.join(","), "-l", selector, "--wait=true"]

  includeUninitialized && args.push("--include-uninitialized")

  return kubectl(ctx, provider).stdout({ namespace, args, log })
}

interface KubectlParams extends ExecParams {
  log: LogEntry
  namespace?: string
  configPath?: string
  args: string[]
}

interface KubectlSpawnParams extends KubectlParams {
  tty?: boolean
  wait?: boolean
}

export function kubectl(ctx: PluginContext, provider: KubernetesProvider) {
  return new Kubectl(ctx.tools["kubernetes.kubectl"].spec, provider)
}

class Kubectl extends PluginTool {
  constructor(spec: PluginToolSpec, private provider: KubernetesProvider) {
    super(spec)
  }

  async stdout(params: KubectlParams) {
    return super.stdout(params)
  }

  async exec(params: KubectlParams) {
    return super.exec(this.prepareArgs(params))
  }

  async spawn(params: KubectlParams) {
    return super.spawn(this.prepareArgs(params))
  }

  async spawnAndWait(params: KubectlSpawnParams) {
    return super.spawnAndWait(this.prepareArgs(params))
  }

  async json(params: KubectlParams): Promise<any> {
    if (!params.args.includes("--output=json")) {
      params.args.push("--output=json")
    }

    const result = await this.stdout(params)

    return JSON.parse(result)
  }

  prepareArgs(params: KubectlParams) {
    const { namespace, configPath, args } = params

    const opts: string[] = []

    if (this.provider.config.context) {
      opts.push(`--context=${this.provider.config.context}`)
    }

    if (this.provider.config.kubeconfig) {
      opts.push(`--kubeconfig=${this.provider.config.kubeconfig}`)
    }

    if (namespace) {
      opts.push(`--namespace=${namespace}`)
    }

    if (configPath) {
      opts.push(`--kubeconfig=${configPath}`)
    }

    return { ...params, args: opts.concat(args) }
  }
}

export const kubectlSpec: PluginToolSpec = {
  name: "kubectl",
  description: "The official Kubernetes CLI.",
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.20.2/bin/darwin/amd64/kubectl",
      sha256: "c4b120ab1284222afbc15f28e4e7d8dfcfc3ad2435bd17e5bfec62e17036623c",
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.20.2/bin/linux/amd64/kubectl",
      sha256: "2583b1c9fbfc5443a722fb04cf0cc83df18e45880a2cf1f6b52d9f595c5beb88",
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.20.2/bin/linux/aarch64/kubectl",
      sha256: "37fdba9fcd43cafba11ac4f82692e41aca41b59f44fd968fd84c263d71af580f",
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.20.2/bin/windows/amd64/kubectl.exe",
      sha256: "d8731ac97166c506441e5d2f69e31d57356983ae15602ba12cc16981862bfdef",
    },
  ],
}
