/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { intersection, cloneDeep } from "lodash"

import { PluginContext } from "../../plugin-context"
import { KubeApi, KubernetesError } from "./api"
import { KubernetesProvider, KubernetesPluginContext, NamespaceConfig } from "./config"
import { DeploymentError, TimeoutError } from "../../exceptions"
import { getPackageVersion, sleep } from "../../util/util"
import { GetEnvironmentStatusParams } from "../../types/plugin/provider/getEnvironmentStatus"
import { KUBECTL_DEFAULT_TIMEOUT } from "./kubectl"
import { LogEntry } from "../../logger/log-entry"
import { gardenAnnotationKey } from "../../util/string"
import dedent from "dedent"
import { HelmModule } from "./helm/config"
import { KubernetesModule } from "./kubernetes-module/config"
import { V1Namespace } from "@kubernetes/client-node"
import { isSubset } from "../../util/is-subset"
import chalk from "chalk"
import { NamespaceStatus } from "../../types/plugin/base"
import { KubernetesServerResource } from "./types"

const GARDEN_VERSION = getPackageVersion()

const cache: {
  [name: string]: {
    status: "pending" | "created"
    resource?: KubernetesServerResource<V1Namespace>
  }
} = {}

interface EnsureNamespaceResult {
  remoteResource?: KubernetesServerResource<V1Namespace>
  patched: boolean
  created: boolean
}

/**
 * Makes sure the given namespace exists and has the configured annotations and labels.
 *
 * Returns the namespace resource if it was created or updated, or null if nothing was done.
 */
export async function ensureNamespace(
  api: KubeApi,
  namespace: NamespaceConfig,
  log: LogEntry
): Promise<EnsureNamespaceResult> {
  const result: EnsureNamespaceResult = { patched: false, created: false }

  if (!cache[namespace.name] || namespaceNeedsUpdate(cache[namespace.name].resource!, namespace)) {
    cache[namespace.name] = { status: "pending" }

    // Get the latest remote namespace list
    const namespacesStatus = await api.core.listNamespace()

    for (const n of namespacesStatus.items) {
      if (n.status.phase === "Active") {
        cache[n.metadata.name] = { status: "created", resource: n }
      }
      if (n.metadata.name === namespace.name) {
        result.remoteResource = n
      }
    }

    if (cache[namespace.name].status !== "created") {
      log.verbose("Creating namespace " + namespace.name)
      try {
        result.remoteResource = await api.core.createNamespace({
          apiVersion: "v1",
          kind: "Namespace",
          metadata: {
            name: namespace.name,
            annotations: {
              [gardenAnnotationKey("generated")]: "true",
              [gardenAnnotationKey("version")]: GARDEN_VERSION,
              ...(namespace.annotations || {}),
            },
            labels: namespace.labels,
          },
        })
        result.created = true
      } catch (error) {
        throw new KubernetesError(
          `Namespace ${namespace.name} doesn't exist and Garden was unable to create it. You may need to create it manually or ask an administrator to do so.`,
          { error }
        )
      }
    } else if (namespaceNeedsUpdate(result.remoteResource, namespace)) {
      // Make sure annotations and labels are set correctly if the namespace already exists
      log.verbose("Updating annotations and labels on namespace " + namespace.name)
      try {
        result.remoteResource = await api.core.patchNamespace(namespace.name, {
          metadata: {
            annotations: namespace.annotations,
            labels: namespace.labels,
          },
        })
        result.patched = true
      } catch {
        log.warn(chalk.yellow(`Unable to apply the configured annotations and labels on namespace ${namespace.name}`))
      }
    }

    cache[namespace.name] = { status: "created", resource: result.remoteResource }
  }

  return result
}

function namespaceNeedsUpdate(resource: KubernetesServerResource<V1Namespace> | undefined, config: NamespaceConfig) {
  return (
    resource &&
    (!isSubset(resource.metadata?.annotations, config.annotations) ||
      !isSubset(resource.metadata?.labels, config.labels))
  )
}

/**
 * Returns `true` if the namespace exists, `false` otherwise.
 */
export async function namespaceExists(api: KubeApi, name: string): Promise<boolean> {
  if (cache[name]) {
    return true
  }

  try {
    await api.core.readNamespace(name)
    return true
  } catch (err) {
    if (err.statusCode === 404) {
      return false
    } else {
      throw err
    }
  }
}

interface GetNamespaceParams {
  log: LogEntry
  override?: NamespaceConfig
  ctx: PluginContext
  provider: KubernetesProvider
  skipCreate?: boolean
}

/**
 * Resolves a namespace name given project context, provider config, and a (usually undefined) override, and then
 * ensures it exists in the target cluster (unless skipCreate=true).
 *
 * Returns a namespace status (which includes the namespace's name).
 */
export async function getNamespaceStatus({
  log,
  ctx,
  override,
  provider,
  skipCreate,
}: GetNamespaceParams): Promise<NamespaceStatus> {
  const namespace = cloneDeep(override || provider.config.namespace)!

  const api = await KubeApi.factory(log, ctx, provider)
  if (!skipCreate) {
    await ensureNamespace(api, namespace, log)
    return {
      pluginName: provider.name,
      namespaceName: namespace.name,
      state: "ready",
    }
  } else {
    return {
      pluginName: provider.name,
      namespaceName: namespace.name,
      state: (await namespaceExists(api, namespace.name)) ? "ready" : "missing",
    }
  }
}

export async function getSystemNamespace(
  ctx: PluginContext,
  provider: KubernetesProvider,
  log: LogEntry,
  api?: KubeApi
): Promise<string> {
  const namespace = { name: provider.config.gardenSystemNamespace }

  if (!api) {
    api = await KubeApi.factory(log, ctx, provider)
  }
  await ensureNamespace(api, namespace, log)

  return namespace.name
}

export async function getAppNamespace(
  ctx: PluginContext,
  log: LogEntry,
  provider: KubernetesProvider
): Promise<string> {
  const status = await getNamespaceStatus({
    log,
    ctx,
    provider,
  })
  return status.namespaceName
}

export async function getAppNamespaceStatus(
  ctx: PluginContext,
  log: LogEntry,
  provider: KubernetesProvider
): Promise<NamespaceStatus> {
  return getNamespaceStatus({
    log,
    ctx,
    provider,
  })
}

export async function getAllNamespaces(api: KubeApi): Promise<string[]> {
  const allNamespaces = await api.core.listNamespace()
  return allNamespaces.items.map((n) => n.metadata.name)
}

/**
 * Used by both the remote and local plugin
 */
export async function prepareNamespaces({ ctx, log }: GetEnvironmentStatusParams) {
  const k8sCtx = <KubernetesPluginContext>ctx

  try {
    const api = await KubeApi.factory(log, ctx, ctx.provider as KubernetesProvider)
    await api.request({ path: "/version", log })
  } catch (err) {
    log.setError("Error")

    throw new DeploymentError(
      dedent`
      Unable to connect to Kubernetes cluster. Got error:

      ${err.message}
    `,
      { providerConfig: k8sCtx.provider.config }
    )
  }

  const ns = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)

  // Including the metadata-namespace key for backwards-compatibility in provider outputs
  return {
    "app-namespace": ns,
    "metadata-namespace": ns,
  }
}

export async function deleteNamespaces(namespaces: string[], api: KubeApi, log?: LogEntry) {
  for (const ns of namespaces) {
    try {
      // Note: Need to call the delete method with an empty object
      // TODO: any cast is required until https://github.com/kubernetes-client/javascript/issues/52 is fixed
      await api.core.deleteNamespace(ns, <any>{})
    } catch (err) {
      // Ignore not found errors.
      if (err.statusCode !== 404) {
        throw err
      }
    }
  }

  // Wait until namespaces have been deleted
  const startTime = new Date().getTime()
  while (true) {
    await sleep(2000)

    const nsNames = await getAllNamespaces(api)
    if (intersection(nsNames, namespaces).length === 0) {
      if (log) {
        log.setSuccess()
      }
      break
    }

    const now = new Date().getTime()
    if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      throw new TimeoutError(`Timed out waiting for namespace ${namespaces.join(", ")} delete to complete`, {
        namespaces,
      })
    }
  }
}

export async function getModuleNamespace({
  ctx,
  log,
  module,
  provider,
  skipCreate,
}: {
  ctx: KubernetesPluginContext
  log: LogEntry
  module: HelmModule | KubernetesModule
  provider: KubernetesProvider
  skipCreate?: boolean
}): Promise<string> {
  const status = await getModuleNamespaceStatus({
    ctx,
    log,
    module,
    provider,
    skipCreate,
  })
  return status.namespaceName
}

export async function getModuleNamespaceStatus({
  ctx,
  log,
  module,
  provider,
  skipCreate,
}: {
  ctx: KubernetesPluginContext
  log: LogEntry
  module: HelmModule | KubernetesModule
  provider: KubernetesProvider
  skipCreate?: boolean
}): Promise<NamespaceStatus> {
  return getNamespaceStatus({
    log,
    ctx,
    override: module.spec?.namespace ? { name: module.spec.namespace } : undefined,
    provider,
    skipCreate,
  })
}
