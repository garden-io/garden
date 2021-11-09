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
import { KubeApi } from "./api"

// Corresponds to the default prune whitelist in `kubectl`.
// See: https://github.com/kubernetes/kubectl/blob/master/pkg/cmd/apply/prune.go#L176-L192
const versionedPruneKinds = [
  { apiVersion: "v1", kind: "ConfigMap" },
  { apiVersion: "v1", kind: "Endpoints" },
  { apiVersion: "v1", kind: "Namespace" },
  { apiVersion: "v1", kind: "PersistentVolumeClaim" },
  { apiVersion: "v1", kind: "PersistentVolume" },
  { apiVersion: "v1", kind: "Pod" },
  { apiVersion: "v1", kind: "ReplicationController" },
  { apiVersion: "v1", kind: "Secret" },
  { apiVersion: "v1", kind: "Service" },
  { apiVersion: "batch/v1", kind: "Job" },
  { apiVersion: "batch/v1", kind: "CronJob" },
  { apiVersion: "batch/v1beta1", kind: "CronJob" },
  { apiVersion: "extensions/v1beta1", kind: "Ingress" },
  { apiVersion: "networking.k8s.io/v1", kind: "Ingress" },
  { apiVersion: "apps/v1", kind: "DaemonSet" },
  { apiVersion: "apps/v1", kind: "Deployment" },
  { apiVersion: "apps/v1", kind: "ReplicaSet" },
  { apiVersion: "apps/v1", kind: "StatefulSet" },
]

export interface ApplyParams {
  log: LogEntry
  ctx: PluginContext
  api: KubeApi
  provider: KubernetesProvider
  manifests: KubernetesResource[]
  namespace?: string
  dryRun?: boolean
  pruneLabels?: { [label: string]: string }
  validate?: boolean
}

export const KUBECTL_DEFAULT_TIMEOUT = 300

export async function apply({
  log,
  ctx,
  api,
  provider,
  manifests,
  dryRun = false,
  namespace,
  pruneLabels,
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

  // The `--prune` option for `kubectl apply` currently isn't backwards-compatible, so here, we essentially
  // reimplement the pruning logic. This enables us to prune resources in a way that works for newer and older
  // versions of Kubernetes, while still being able to use an up-to-date version of `kubectl`.
  //
  // This really should be fixed in `kubectl` proper. In fact, simply including resource mappings for older/beta API
  // versions and adding the appropriate error handling for missing API/resource versions to the pruning logic would
  // be enough to make `kubectl apply --prune` backwards-compatible.
  let resourcesToPrune: KubernetesResource[] = []
  if (namespace && pruneLabels) {
    // Fetch all deployed resources in the namesapce matching `pruneLabels` (for all resource kinds represented in
    // `versionedPruneKinds` - see its definition above).
    const resourcesForLabels = await api.listResourcesForKinds({
      log,
      namespace,
      versionedKinds: versionedPruneKinds,
      labelSelector: pruneLabels,
    })

    // We only prune resources that were created/updated via `kubectl apply (this is how `kubectl apply --prune` works)
    // and that don't match any of the applied manifests by kind and name.
    resourcesToPrune = resourcesForLabels
      .filter((r) => r.metadata.annotations?.["kubectl.kubernetes.io/last-applied-configuration"])
      .filter((r) => !manifests.find((m) => m.kind === r.kind && m.metadata.name === r.metadata.name))
  }

  const input = Buffer.from(encodeYamlMulti(manifests))

  let args = ["apply"]
  dryRun && args.push("--dry-run")
  args.push("--output=json", "-f", "-")
  !validate && args.push("--validate=false")

  const result = await kubectl(ctx, provider).stdout({ log, namespace, args, input })

  if (namespace && resourcesToPrune.length > 0) {
    await deleteResources({
      log,
      ctx,
      provider,
      namespace,
      resources: resourcesToPrune,
    })
  }

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
    const opts = prepareConnectionOpts({
      provider: this.provider,
      configPath,
      namespace,
    })

    return { ...params, args: opts.concat(args) }
  }
}

export function prepareConnectionOpts({
  provider,
  configPath,
  namespace,
}: {
  provider: KubernetesProvider
  configPath?: string
  namespace?: string
}): string[] {
  const opts: string[] = []

  if (provider.config.context) {
    opts.push(`--context=${provider.config.context}`)
  }

  if (provider.config.kubeconfig) {
    opts.push(`--kubeconfig=${provider.config.kubeconfig}`)
  }

  if (namespace) {
    opts.push(`--namespace=${namespace}`)
  }

  if (configPath) {
    opts.push(`--kubeconfig=${configPath}`)
  }

  return opts
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
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.22.3/bin/darwin/amd64/kubectl",
      sha256: "beea08a2a166a002603e2aa015223b5ba558d6e3f6a81098e3cc5d7d2b7a64d9",
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.22.3/bin/linux/amd64/kubectl",
      sha256: "0751808ca8d7daba56bf76b08848ef5df6b887e9d7e8a9030dd3711080e37b54",
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://storage.googleapis.com/kubernetes-release/release/v1.22.3/bin/windows/amd64/kubectl.exe",
      sha256: "c1c148569b1aa500fc46151756c497d7fbbff0789f316d7be444ace1dc793593",
    },
  ],
}
