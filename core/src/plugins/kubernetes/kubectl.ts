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
import { cloneDeep } from "lodash-es"
import { styles } from "../../logger/styles.js"

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
  setHashAnnotation?: boolean
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
  setHashAnnotation = true,
}: ApplyParams) {
  // Hash the raw input and add as an annotation on each manifest (this is helpful beyond kubectl's own annotation,
  // because kubectl applies some normalization/transformation that is sometimes difficult to reason about).
  // Hashing the input prevents "Too long annotation..." errors.
  for (const manifest of manifests) {
    if (!manifest.metadata.annotations) {
      manifest.metadata.annotations = {}
    }
    if (setHashAnnotation) {
      if (manifest.metadata.annotations[k8sManifestHashAnnotationKey]) {
        delete manifest.metadata.annotations[k8sManifestHashAnnotationKey]
      }
      manifest.metadata.annotations[k8sManifestHashAnnotationKey] = await hashManifest(manifest)
    }
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

export interface KubectlDiffParams {
  log: Log
  ctx: PluginContext
  provider: KubernetesProvider
  manifests: KubernetesResource[]
  namespace?: string
}

export interface KubectlDiffResult {
  /** Whether there are any differences */
  hasDiff: boolean
  /** The unified diff output from kubectl */
  diffOutput: string
}

/**
 * Colorizes unified diff output for better readability.
 * Lines starting with + are green, - are red, @@ are cyan, others are gray.
 * Skips the noisy diff/file header lines that show temp file paths.
 */
function colorizeDiffOutput(diffOutput: string): string {
  const lines = diffOutput.split("\n")
  const coloredLines: string[] = []

  for (const line of lines) {
    // Skip the diff command header and temp file paths (not useful to users)
    if (line.startsWith("diff -u") || line.startsWith("diff -N")) {
      continue
    }
    // Skip the --- and +++ file header lines (they show temp file paths)
    if ((line.startsWith("--- /") || line.startsWith("+++ /")) && line.includes("/T/")) {
      continue
    }

    // Colorize the remaining lines
    if (line.startsWith("+")) {
      coloredLines.push(styles.success(line))
    } else if (line.startsWith("-")) {
      coloredLines.push(styles.error(line))
    } else if (line.startsWith("@@")) {
      coloredLines.push(styles.highlight(line))
    } else {
      coloredLines.push(styles.secondary(line))
    }
  }

  return coloredLines.join("\n")
}

/**
 * Runs `kubectl diff` to compare manifests against what's currently deployed.
 * This provides a proper unified diff that handles YAML arrays correctly.
 *
 * The manifests are prepared with the same annotations that would be added during
 * actual deployment (like the manifest-hash annotation).
 *
 * Note: kubectl diff exits with code 0 if no difference, 1 if there are differences,
 * and >1 for errors.
 */
export async function kubectlDiff({
  log,
  ctx,
  provider,
  manifests,
  namespace,
}: KubectlDiffParams): Promise<KubectlDiffResult> {
  if (manifests.length === 0) {
    return { hasDiff: false, diffOutput: "" }
  }

  // Clone manifests and add the manifest-hash annotation (same as apply does)
  // This ensures the diff shows what would actually change when deployed
  const preparedManifests = await Promise.all(
    manifests.map(async (manifest) => {
      const prepared = cloneDeep(manifest)
      if (!prepared.metadata.annotations) {
        prepared.metadata.annotations = {}
      }
      // Remove existing hash annotation before computing new one (same logic as apply)
      if (prepared.metadata.annotations[k8sManifestHashAnnotationKey]) {
        delete prepared.metadata.annotations[k8sManifestHashAnnotationKey]
      }
      prepared.metadata.annotations[k8sManifestHashAnnotationKey] = await hashManifest(prepared)
      return prepared
    })
  )

  const input = Buffer.from(encodeYamlMulti(preparedManifests))
  const args = ["diff", "-f", "-"]

  try {
    const result = await kubectl(ctx, provider).exec({
      log,
      namespace,
      args,
      input,
      ignoreError: true, // Don't throw on non-zero exit code (kubectl diff returns 1 for differences)
    })

    // kubectl diff exits with:
    // 0 - no differences
    // 1 - differences found
    // >1 - error
    if (result.exitCode === 0) {
      return { hasDiff: false, diffOutput: "" }
    } else if (result.exitCode === 1) {
      // Differences found - stdout contains the diff, colorize it
      return { hasDiff: true, diffOutput: colorizeDiffOutput(result.stdout) }
    } else {
      // Error occurred - log warning and return empty diff
      // This can happen if the resource doesn't exist yet (which is fine for dry-run)
      const errorOutput = result.stderr || result.stdout
      if (errorOutput.includes("NotFound") || errorOutput.includes("not found")) {
        // Resource doesn't exist yet - this is expected for new resources
        return { hasDiff: true, diffOutput: "" }
      }
      log.warn(`kubectl diff returned error (exit code ${result.exitCode}): ${errorOutput}`)
      return { hasDiff: false, diffOutput: "" }
    }
  } catch (error) {
    // If kubectl diff fails entirely, fall back to no diff
    log.warn(`kubectl diff failed: ${error}`)
    return { hasDiff: false, diffOutput: "" }
  }
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

export const kubectlVersion = "1.33.2"
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
      sha256: "9f9273ebc84dd5e247d8dc4ec84b6e4377571a2acf456fdcc0fad370b69ae2f9",
      extract: {
        format: "tar",
        targetPath: "kubernetes/client/bin/kubectl",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://dl.k8s.io/v${kubectlVersion}/kubernetes-client-darwin-arm64.tar.gz`,
      sha256: "55f85c6ade6f2bfb1bf2ea9efef1510001c5d49bf08d0ab2af3ace9fb83a7d1c",
      extract: {
        format: "tar",
        targetPath: "kubernetes/client/bin/kubectl",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://dl.k8s.io/v${kubectlVersion}/kubernetes-client-linux-amd64.tar.gz`,
      sha256: "9887ff978c56c512643a0a0878ab92937d1756e34b2910459beda09ad1c3021a",
      extract: {
        format: "tar",
        targetPath: "kubernetes/client/bin/kubectl",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://dl.k8s.io/v${kubectlVersion}/kubernetes-client-linux-arm64.tar.gz`,
      sha256: "83fab32c40b04c7326b8571f260ce830a4b7ab6545b745d6ed8a43b06c3c0cda",
      extract: {
        format: "tar",
        targetPath: "kubernetes/client/bin/kubectl",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://dl.k8s.io/v${kubectlVersion}/kubernetes-client-windows-amd64.tar.gz`,
      sha256: "933e8e425cea887a93b2cea3b045097dd7ab69cb60ce1c723184e2e754f6d816",
      extract: {
        format: "tar",
        targetPath: "kubernetes/client/bin/kubectl.exe",
      },
    },
  ],
}
