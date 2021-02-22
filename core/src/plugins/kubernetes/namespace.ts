/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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

const GARDEN_VERSION = getPackageVersion()
type CreateNamespaceStatus = "pending" | "created"
const created: { [name: string]: CreateNamespaceStatus } = {}

/**
 * Makes sure the given namespace exists and has the configured annotations and labels.
 * Returns true if the namespace was created or updated, false if nothing was done.
 */
export async function ensureNamespace(api: KubeApi, namespace: NamespaceConfig, log: LogEntry) {
  if (!created[namespace.name]) {
    created[namespace.name] = "pending"
    const namespacesStatus = await api.core.listNamespace()
    let remoteNamespace: V1Namespace | undefined = undefined

    for (const n of namespacesStatus.items) {
      if (n.status.phase === "Active") {
        created[n.metadata.name] = "created"
      }
      if (n.metadata.name === namespace.name) {
        remoteNamespace = n
      }
    }

    if (created[namespace.name] !== "created") {
      log.verbose("Creating namespace " + namespace.name)
      try {
        return api.core.createNamespace({
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
      } catch (error) {
        throw new KubernetesError(
          `Namespace ${namespace.name} doesn't exist and Garden was unable to create it. You may need to create it manually or ask an administrator to do so.`,
          { error }
        )
      }
    } else if (
      remoteNamespace &&
      (!isSubset(remoteNamespace.metadata?.annotations, namespace.annotations) ||
        !isSubset(remoteNamespace.metadata?.labels, namespace.labels))
    ) {
      // Make sure annotations and labels are set correctly if the namespace already exists
      log.verbose("Updating annotations and labels on namespace " + namespace.name)
      try {
        return api.core.patchNamespace(namespace.name, {
          metadata: {
            annotations: namespace.annotations,
            labels: namespace.labels,
          },
        })
      } catch {
        log.warn(chalk.yellow(`Unable to apply the configured annotations and labels on namespace ${namespace.name}`))
      }
    }

    created[namespace.name] = "created"
  }

  return null
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
 */
export async function getNamespace({ log, ctx, override, provider, skipCreate }: GetNamespaceParams): Promise<string> {
  const namespace = cloneDeep(override || provider.config.namespace)!

  if (!skipCreate) {
    const api = await KubeApi.factory(log, ctx, provider)
    await ensureNamespace(api, namespace, log)
  }

  return namespace.name
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

export async function getAppNamespace(ctx: PluginContext, log: LogEntry, provider: KubernetesProvider) {
  return getNamespace({
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

  const ns = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

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
}) {
  return getNamespace({
    log,
    ctx,
    override: module.spec.namespace ? { name: module.spec.namespace } : undefined,
    provider,
    skipCreate,
  })
}
