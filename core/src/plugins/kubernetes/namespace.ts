/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { intersection, cloneDeep } from "lodash-es"

import { KubeApi, KubernetesError } from "./api.js"
import type { KubernetesProvider, KubernetesPluginContext, NamespaceConfig } from "./config.js"
import { DeploymentError, TimeoutError } from "../../exceptions.js"
import { getPackageVersion, sleep } from "../../util/util.js"
import type { GetEnvironmentStatusParams } from "../../plugin/handlers/Provider/getEnvironmentStatus.js"
import { KUBECTL_DEFAULT_TIMEOUT } from "./kubectl.js"
import type { Log } from "../../logger/log-entry.js"
import { gardenAnnotationKey } from "../../util/string.js"
import dedent from "dedent"
import type { V1Namespace } from "@kubernetes/client-node"
import { isSubset } from "../../util/is-subset.js"
import type { NamespaceStatus } from "../../types/namespace.js"
import type { KubernetesServerResource, SupportedRuntimeAction } from "./types.js"
import type { Resolved } from "../../actions/types.js"
import { BoundedCache } from "../../cache.js"
import AsyncLock from "async-lock"

const GARDEN_VERSION = getPackageVersion()

interface NamespaceCacheForProvider {
  [namespaceName: string]: {
    status: "pending" | "created"
    resource?: KubernetesServerResource<V1Namespace>
  }
}

// TODO: Provide a cache via the `PluginContext` instead. Let's think about that once we have 1-2 more
// motivating use-cases before we settle on the shape.
const nsCache = new BoundedCache<NamespaceCacheForProvider>(50)

interface EnsureNamespaceResult {
  remoteResource?: KubernetesServerResource<V1Namespace>
  patched: boolean
  created: boolean
}

// To prevent race conditions when two `ensureNamespace` calls attempt to create the namespace simultaneously
// (which can happen e.g. during deploys after a `delete namespace` command in an interactive session).
const nsCreationLock = new AsyncLock()

/**
 * Makes sure the given namespace exists and has the configured annotations and labels.
 *
 * Returns the namespace resource if it was created or updated, or null if nothing was done.
 */
export async function ensureNamespace(
  api: KubeApi,
  ctx: KubernetesPluginContext,
  namespace: NamespaceConfig,
  log: Log
): Promise<EnsureNamespaceResult> {
  const result: EnsureNamespaceResult = { patched: false, created: false }
  await nsCreationLock.acquire(namespace.name, async () => {
    const providerUid = ctx.provider.uid
    const cache = nsCache.get(providerUid) || {}

    if (!cache[namespace.name] || namespaceNeedsUpdate(cache[namespace.name].resource!, namespace)) {
      // FIXME: if passed `namespace: string` this will set cache[undefined]
      // This seems to require `namespace: { name: foo }` in project config contrary to docs
      cache[namespace.name] = { status: "pending" }

      // Get the latest remote namespace list
      let namespaces: KubernetesServerResource<V1Namespace>[] = []
      try {
        const namespacesStatus = await api.core.listNamespace()
        namespaces = namespacesStatus.items
      } catch (error) {
        log.warn("Unable to list all namespaces. If you are using OpenShift, ignore this warning.")
        const namespaceStatus = await api.core.readNamespace({ name: namespace.name })
        namespaces = [namespaceStatus]
      }

      for (const n of namespaces) {
        if (n.status.phase === "Active") {
          cache[n.metadata.name] = { status: "created", resource: n }
        }
        if (n.metadata.name === namespace.name) {
          result.remoteResource = n
          if (n.status.phase === "Terminating") {
            throw new KubernetesError({
              message: dedent`Namespace "${n.metadata.name}" is in "Terminating" state so Garden is unable to create it.
            Please try again once the namespace has terminated.`,
            })
          }
        }
      }

      if (cache[namespace.name].status !== "created") {
        // FIXME: fix root cause, remove check
        if (cache[namespace.name] === undefined) {
          log.verbose("Not creating a namespace called undefined")
          return
        }

        log.verbose("Creating namespace " + namespace.name)
        try {
          result.remoteResource = await api.core.createNamespace({
            body: {
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
            },
          })
          result.created = true
        } catch (error) {
          throw new KubernetesError({
            message: `Namespace ${namespace.name} doesn't exist and Garden was unable to create it. ${error}\n\nYou may need to create it manually or ask an administrator to do so.`,
          })
        }
      } else if (namespaceNeedsUpdate(result.remoteResource, namespace)) {
        // Make sure annotations and labels are set correctly if the namespace already exists
        log.verbose("Updating annotations and labels on namespace " + namespace.name)
        try {
          result.remoteResource = await api.core.patchNamespace({
            name: namespace.name,
            body: {
              metadata: {
                annotations: namespace.annotations,
                labels: namespace.labels,
              },
            },
          })
          result.patched = true
        } catch {
          log.warn(`Unable to apply the configured annotations and labels on namespace ${namespace.name}`)
        }
      }

      cache[namespace.name] = { status: "created", resource: result.remoteResource }
      nsCache.set(providerUid, cache)
    }
  })
  ctx.events.emit("namespaceStatus", { pluginName: ctx.provider.name, namespaceName: namespace.name, state: "ready" })

  return result
}

function namespaceNeedsUpdate(resource: KubernetesServerResource<V1Namespace> | undefined, config: NamespaceConfig) {
  return (
    resource &&
    (!isSubset(resource.metadata?.annotations || {}, config.annotations || {}) ||
      !isSubset(resource.metadata?.labels || {}, config.labels || {}))
  )
}

/**
 * Returns `true` if the namespace exists, `false` otherwise.
 */
export async function namespaceExists(api: KubeApi, ctx: KubernetesPluginContext, name: string): Promise<boolean> {
  const cache = nsCache.get(ctx.provider.uid)
  if (cache && cache[name]) {
    return true
  }

  const namespaceResource = await fetchNamespaceResource(api, name)
  return !!namespaceResource
}

/**
 * Returns `true` if the namespace exists, `false` otherwise.
 */
export async function fetchNamespaceResource(
  api: KubeApi,
  name: string
): Promise<KubernetesServerResource<V1Namespace> | undefined> {
  try {
    return await api.core.readNamespace({ name })
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode === 404) {
      return undefined
    } else {
      throw err
    }
  }
}

interface GetNamespaceParams {
  log: Log
  override?: NamespaceConfig
  ctx: KubernetesPluginContext
  provider: KubernetesProvider
  skipCreate?: boolean
}

function composeNamespaceStatus({
  pluginName,
  namespaceName,
  namespaceUid,
}: {
  pluginName: string
  namespaceName: string
  namespaceUid: string | undefined
}): NamespaceStatus {
  if (namespaceUid === undefined) {
    return {
      pluginName,
      namespaceName,
      namespaceUid: undefined,
      state: "missing",
    }
  } else {
    return {
      pluginName,
      namespaceUid,
      namespaceName,
      state: "ready",
    }
  }
}

/**
 * Resolves a namespace name given project context, provider config, and a (usually undefined) override, and then
 * ensures it exists in the target cluster (unless skipCreate=true).
 *
 * Returns a namespace status (which includes the namespace's name).
 *
 * Also emits a `namespaceStatus` event on the provided plugin context's event bus. This means that the caller doesn't
 * need to worry about remembering to emit namespace events (they are then caught by the base router and re-emitted on
 * the Garden instance's event bus).
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
  let status: NamespaceStatus
  if (!skipCreate) {
    const ensureNamespaceResult = await ensureNamespace(api, ctx, namespace, log)
    // it still can be null if the namespace existed, but was not updated
    if (ensureNamespaceResult.remoteResource === undefined) {
      const remoteResource = await fetchNamespaceResource(api, namespace.name)
      const namespaceUid = remoteResource?.metadata.uid
      status = composeNamespaceStatus({ pluginName: provider.name, namespaceName: namespace.name, namespaceUid })
    } else {
      const namespaceUid = ensureNamespaceResult.remoteResource.metadata.uid
      status = composeNamespaceStatus({ pluginName: provider.name, namespaceName: namespace.name, namespaceUid })
    }
  } else {
    const namespaceResource = await fetchNamespaceResource(api, namespace.name)
    const namespaceUid = namespaceResource?.metadata.uid
    status = composeNamespaceStatus({ pluginName: provider.name, namespaceName: namespace.name, namespaceUid })
  }

  ctx.events.emit("namespaceStatus", {
    pluginName: status.pluginName,
    namespaceName: status.namespaceName,
    state: status.state,
  })

  return status
}

export async function getSystemNamespace(
  ctx: KubernetesPluginContext,
  provider: KubernetesProvider,
  log: Log,
  api?: KubeApi
): Promise<string> {
  const namespace = { name: provider.config.gardenSystemNamespace }
  // HACK: in OpenShift, we work in only one namespace, the one assigned to the developer
  if (!namespace.name) {
    log.warn("No system namespace found, using the current namespace. If you are using OpenShift, ignore this warning.")
    namespace.name = provider.config.namespace!.name
  }

  if (!api) {
    api = await KubeApi.factory(log, ctx, provider)
  }
  await ensureNamespace(api, ctx, namespace, log)

  return namespace.name
}

export async function getAppNamespace(
  ctx: KubernetesPluginContext,
  log: Log,
  provider: KubernetesProvider
): Promise<string> {
  const status = await getNamespaceStatus({
    log,
    ctx,
    provider,
  })
  return status.namespaceName
}

export async function getAllNamespaces(api: KubeApi): Promise<string[]> {
  const allNamespaces = await api.core.listNamespace()
  return allNamespaces.items.map((n) => n.metadata.name)
}

export function clearNamespaceCache(provider: KubernetesProvider) {
  nsCache.delete(provider.uid)
}

/**
 * Used by both the remote and local plugin
 */
export async function prepareNamespace({ ctx, log }: GetEnvironmentStatusParams) {
  const k8sCtx = <KubernetesPluginContext>ctx

  try {
    const api = await KubeApi.factory(log, ctx, ctx.provider as KubernetesProvider)
    await api.request({ path: "/version", log })
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    log.silly(() => `Full Kubernetes connect error: ${err.stack}`)

    throw new DeploymentError({
      message: dedent`
        Unable to connect to Kubernetes cluster. Got error: ${err.message}`,
      wrappedErrors: [err],
    })
  }

  const ns = await getNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })

  return {
    "app-namespace": ns,
  }
}

/**
 * Note: When possible, always use this helper to delete k8s namespaces, since that ensures that namespace status
 * events are emitted and the provider namespace cache is cleared.
 */
export async function deleteNamespaces({
  namespaces,
  api,
  ctx,
  log,
}: {
  namespaces: string[]
  api: KubeApi
  ctx: KubernetesPluginContext
  log?: Log
}) {
  for (const ns of namespaces) {
    try {
      await api.core.deleteNamespace({ name: ns })
    } catch (err) {
      if (!(err instanceof KubernetesError)) {
        throw err
      }
      // Ignore not found errors.
      if (err.responseStatusCode !== 404) {
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
        log.success("Done")
      }
      break
    }

    const now = new Date().getTime()
    if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      throw new TimeoutError({
        message: `Timed out waiting for namespace ${namespaces.join(", ")} delete to complete`,
      })
    }
  }
  if (namespaces.length > 0) {
    for (const ns of namespaces) {
      ctx.events.emit("namespaceStatus", { pluginName: ctx.provider.name, namespaceName: ns, state: "missing" })
    }
    // Since we've deleted one or more namespaces, we invalidate the NS cache for this provider instance.
    clearNamespaceCache(ctx.provider)
  }
}

export async function getActionNamespace({
  ctx,
  log,
  action,
  provider,
  skipCreate,
}: {
  ctx: KubernetesPluginContext
  log: Log
  action: Resolved<SupportedRuntimeAction>
  provider: KubernetesProvider
  skipCreate?: boolean
}): Promise<string> {
  const status = await getActionNamespaceStatus({
    ctx,
    log,
    action,
    provider,
    skipCreate,
  })
  return status.namespaceName
}

export async function getActionNamespaceStatus({
  ctx,
  log,
  action,
  provider,
  skipCreate,
}: {
  ctx: KubernetesPluginContext
  log: Log
  action: Resolved<SupportedRuntimeAction>
  provider: KubernetesProvider
  skipCreate?: boolean
}): Promise<NamespaceStatus> {
  let namespace: string | undefined

  if (action.type !== "container") {
    namespace = action.getSpec().namespace
  }

  return getNamespaceStatus({
    log,
    ctx,
    override: namespace ? { name: namespace } : undefined,
    provider,
    skipCreate,
  })
}
