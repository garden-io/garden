/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { encodeYamlMulti } from "../../util/serialization.js"
import type { ExecParams } from "../../util/ext-tools.js"
import { PluginTool } from "../../util/ext-tools.js"
import type { Log } from "../../logger/log-entry.js"
import type { KubernetesPluginContext, KubernetesProvider } from "./config.js"
import type { KubernetesResource } from "./types.js"
import { dedent } from "../../util/string.js"
import { getResourceKey, hashManifest } from "./util.js"
import type { PluginToolSpec } from "../../plugin/tools.js"
import type { PluginContext } from "../../plugin-context.js"
import { KubeApi } from "./api.js"
import { KUBECTL_RETRY_OPTS, KubernetesError } from "./api.js"
import fsExtra from "fs-extra"

const { pathExists } = fsExtra
import { ChildProcessError, ConfigurationError } from "../../exceptions.js"
import type { RetryOpts } from "./retry.js"
import { requestWithRetry } from "./retry.js"
import { k8sManifestHashAnnotationKey } from "./status/status.js"
import { loadAll } from "js-yaml"
import { isTruthy } from "../../util/util.js"
import { readFile } from "fs/promises"

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
  log: Log
  ctx: PluginContext
  api: KubeApi
  provider: KubernetesProvider
  manifests: KubernetesResource[]
  namespace?: string
  dryRun?: boolean
  pruneLabels?: { [label: string]: string }
  validate?: boolean
  retryOpts?: RetryOpts
  applyArgs?: string[]
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
  applyArgs,
}: ApplyParams) {
  // Hash the raw input and add as an annotation on each manifest (this is helpful beyond kubectl's own annotation,
  // because kubectl applies some normalization/transformation that is sometimes difficult to reason about).
  // Hashing the input prevents "Too long annotation..." errors.
  for (const manifest of manifests) {
    if (!manifest.metadata.annotations) {
      manifest.metadata.annotations = {}
    }
    if (manifest.metadata.annotations[k8sManifestHashAnnotationKey]) {
      delete manifest.metadata.annotations[k8sManifestHashAnnotationKey]
    }
    manifest.metadata.annotations[k8sManifestHashAnnotationKey] = await hashManifest(manifest)
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
    // Fetch all deployed resources in the namespace matching `pruneLabels` (for all resource kinds represented in
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

  const args = ["apply"]
  dryRun && args.push("--dry-run")
  args.push("--output=json", "-f", "-")
  !validate && args.push("--validate=false")
  applyArgs && args.push(...applyArgs)

  let result: string
  try {
    result = await requestWithRetry(
      log,
      `kubectl ${args.join(" ")}`,
      () =>
        kubectl(ctx, provider).stdout({
          log,
          namespace,
          args,
          input,
        }),
      KUBECTL_RETRY_OPTS
    )
  } catch (e) {
    if (e instanceof ChildProcessError) {
      throw new KubernetesError({
        message: dedent`
          Failed to apply Kubernetes manifests. This is the output of the kubectl command:

          ${e.details.output}`,
      })
    }
    throw e
  }

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

export async function applyYamlFromFile(ctx: KubernetesPluginContext, log: Log, path: string) {
  const api = await KubeApi.factory(log, ctx, ctx.provider)
  const manifests = loadAll((await readFile(path)).toString())
    .filter(isTruthy)
    .map((m) => m as KubernetesResource)
  await apply({ log, ctx, api, provider: ctx.provider, manifests, validate: false })
}

export async function deleteResources(params: {
  log: Log
  ctx: PluginContext
  provider: KubernetesProvider
  namespace: string
  resources: KubernetesResource[]
  includeUninitialized?: boolean
}) {
  const keys = params.resources.map(getResourceKey)
  return deleteResourceKeys({ ...params, keys })
}

export async function deleteResourceKeys({
  log,
  ctx,
  provider,
  namespace,
  keys,
  includeUninitialized = false,
}: {
  log: Log
  ctx: PluginContext
  provider: KubernetesProvider
  namespace: string
  keys: string[]
  includeUninitialized?: boolean
}) {
  const args = ["delete", "--wait=true", "--ignore-not-found=true", ...keys]

  includeUninitialized && args.push("--include-uninitialized")

  return await requestWithRetry(
    log,
    `kubectl ${args.join(" ")}`,
    () => kubectl(ctx, provider).stdout({ namespace, args, log }),
    KUBECTL_RETRY_OPTS
  )
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
  log: Log
  ctx: PluginContext
  provider: KubernetesProvider
  namespace: string
  selector: string
  objectTypes: string[]
  includeUninitialized?: boolean
}) {
  const args = ["delete", objectTypes.join(","), "-l", selector, "--wait=true"]

  includeUninitialized && args.push("--include-uninitialized")

  return await requestWithRetry(
    log,
    `kubectl ${args.join(" ")}`,
    () => kubectl(ctx, provider).stdout({ namespace, args, log }),
    KUBECTL_RETRY_OPTS
  )
}

interface KubectlParams extends ExecParams {
  log: Log
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
  constructor(
    spec: PluginToolSpec,
    private provider: KubernetesProvider
  ) {
    super(spec)
  }

  override async ensurePath(log: Log) {
    const override = this.provider.config.kubectlPath

    if (override) {
      const exists = await pathExists(override)

      if (!exists) {
        throw new ConfigurationError({
          message: `Could not find configured kubectlPath: ${override}`,
        })
      }

      return override
    }

    return super.ensurePath(log)
  }

  override async stdout(params: KubectlParams) {
    return super.stdout(params)
  }

  override async exec(params: KubectlParams) {
    return super.exec(this.prepareArgs(params))
  }

  override async spawn(params: KubectlParams) {
    return super.spawn(this.prepareArgs(params))
  }

  override async spawnAndWait(params: KubectlSpawnParams) {
    return super.spawnAndWait(this.prepareArgs(params))
  }

  override async json(params: KubectlParams): Promise<any> {
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

export const kubectlVersion = "1.31.2"
export const kubectlSpec: PluginToolSpec = {
  name: "kubectl",
  version: kubectlVersion,
  description: `The official Kubernetes CLI, v${kubectlVersion}`,
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://dl.k8s.io/v${kubectlVersion}/kubernetes-client-darwin-amd64.tar.gz`,
      sha256: "7a868b889c91a31f9151f0bc735430ce8e473d3fe8c331c90057832d52c93bdd",
      extract: {
        format: "tar",
        targetPath: "kubernetes/client/bin/kubectl",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://dl.k8s.io/v${kubectlVersion}/kubernetes-client-darwin-arm64.tar.gz`,
      sha256: "584d4391e3c02befbc26f79f8ca8d48c9f926f975190e9bfb5b77fe949fa4286",
      extract: {
        format: "tar",
        targetPath: "kubernetes/client/bin/kubectl",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://dl.k8s.io/v${kubectlVersion}/kubernetes-client-linux-amd64.tar.gz`,
      sha256: "d8f9cddec37bd89867a9a7cdfcf9144c750018ac6746999d9a26d62609123786",
      extract: {
        format: "tar",
        targetPath: "kubernetes/client/bin/kubectl",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://dl.k8s.io/v${kubectlVersion}/kubernetes-client-linux-arm64.tar.gz`,
      sha256: "319ad62ce05e5751a5579d1b2c4512da0532c4f44c219d5bcf50e6596d91c4b9",
      extract: {
        format: "tar",
        targetPath: "kubernetes/client/bin/kubectl",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://dl.k8s.io/v${kubectlVersion}/kubernetes-client-windows-amd64.tar.gz`,
      sha256: "918af747bbc819cf24e1e69f26ce52584eb7b1f3e93de857c9a86e6aff83c65b",
      extract: {
        format: "tar",
        targetPath: "kubernetes/client/bin/kubectl.exe",
      },
    },
  ],
}
