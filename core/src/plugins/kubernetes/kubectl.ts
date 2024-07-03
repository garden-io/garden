/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
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

export const kubectlVersion = "1.30.2"
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
      url: `https://storage.googleapis.com/kubernetes-release/release/v${kubectlVersion}/bin/darwin/amd64/kubectl`,
      sha256: "0371b7bcc060f533170ac6fb99bc9aa13fdf3fa005276e3eb14eed162ed8a3a9",
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://storage.googleapis.com/kubernetes-release/release/v${kubectlVersion}/bin/darwin/arm64/kubectl`,
      sha256: "ffcba19e77b9521f5779ab32cfcd4bfcc9d20cd42c2f075c7c5aef83f32754ae",
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://storage.googleapis.com/kubernetes-release/release/v${kubectlVersion}/bin/linux/amd64/kubectl`,
      sha256: "c6e9c45ce3f82c90663e3c30db3b27c167e8b19d83ed4048b61c1013f6a7c66e",
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://storage.googleapis.com/kubernetes-release/release/v${kubectlVersion}/bin/linux/arm64/kubectl`,
      sha256: "56becf07105fbacd2b70f87f3f696cfbed226cb48d6d89ed7f65ba4acae3f2f8",
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://storage.googleapis.com/kubernetes-release/release/v${kubectlVersion}/bin/windows/amd64/kubectl.exe`,
      sha256: "59a5b1028f6e3aea046b103f9a787cf4d70067d554053f713d691b14df3d9bb4",
    },
  ],
}
