/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { intersection } from "lodash"

import { PluginContext } from "../../plugin-context"
import { KubeApi } from "./api"
import { KubernetesProvider, KubernetesPluginContext } from "./config"
import { DeploymentError, TimeoutError } from "../../exceptions"
import { getPackageVersion, sleep } from "../../util/util"
import { GetEnvironmentStatusParams } from "../../types/plugin/provider/getEnvironmentStatus"
import { kubectl, KUBECTL_DEFAULT_TIMEOUT } from "./kubectl"
import { LogEntry } from "../../logger/log-entry"
import { gardenAnnotationKey } from "../../util/string"
import dedent from "dedent"
import { HelmModule } from "./helm/config"
import { KubernetesModule } from "./kubernetes-module/config"

const GARDEN_VERSION = getPackageVersion()
type CreateNamespaceStatus = "pending" | "created"
const created: { [name: string]: CreateNamespaceStatus } = {}

export async function ensureNamespace(api: KubeApi, namespace: string) {
  if (!created[namespace]) {
    created[namespace] = "pending"
    const namespacesStatus = await api.core.listNamespace()

    for (const n of namespacesStatus.items) {
      if (n.status.phase === "Active") {
        created[n.metadata.name] = "created"
      }
    }

    if (created[namespace] !== "created") {
      // TODO: the types for all the create functions in the library are currently broken
      await createNamespace(api, namespace)
      created[namespace] = "created"
    }
  }
}

// Note: Does not check whether the namespace already exists.
export async function createNamespace(api: KubeApi, namespace: string) {
  // TODO: the types for all the create functions in the library are currently broken
  return api.core.createNamespace(<any>{
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: namespace,
      annotations: {
        [gardenAnnotationKey("generated")]: "true",
        [gardenAnnotationKey("version")]: GARDEN_VERSION,
      },
    },
  })
}

interface GetNamespaceParams {
  log: LogEntry
  override?: string
  projectName: string
  provider: KubernetesProvider
  suffix?: string
  skipCreate?: boolean
}

/**
 * Resolves a namespace name given project context, provider config, and a (usually undefined) override, and then
 * ensures it exists in the target cluster (unless skipCreate=true).
 */
// TODO: this feels convoluted (=a lot of parameters per line of function code), so let's consider refactoring
export async function getNamespace({
  log,
  override,
  projectName,
  provider,
  suffix,
  skipCreate,
}: GetNamespaceParams): Promise<string> {
  let namespace = override || provider.config.namespace || projectName

  if (suffix) {
    namespace = `${namespace}--${suffix}`
  }

  if (!skipCreate) {
    const api = await KubeApi.factory(log, provider)
    await ensureNamespace(api, namespace)
  }

  return namespace
}

export async function getSystemNamespace(provider: KubernetesProvider, log: LogEntry, api?: KubeApi): Promise<string> {
  const namespace = provider.config.gardenSystemNamespace
  if (!api) {
    api = await KubeApi.factory(log, provider)
  }
  await ensureNamespace(api, namespace)

  return namespace
}

export async function getAppNamespace(ctx: PluginContext, log: LogEntry, provider: KubernetesProvider) {
  return getNamespace({
    log,
    projectName: ctx.projectName,
    provider,
  })
}

export function getMetadataNamespace(ctx: PluginContext, log: LogEntry, provider: KubernetesProvider) {
  return getNamespace({
    log,
    projectName: ctx.projectName,
    provider,
    suffix: "metadata",
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
    // TODO: use API instead of kubectl (I just couldn't find which API call to make)
    await kubectl.exec({ log, provider: k8sCtx.provider, args: ["version"] })
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

  return Bluebird.props({
    "app-namespace": getAppNamespace(k8sCtx, log, k8sCtx.provider),
    "metadata-namespace": getMetadataNamespace(k8sCtx, log, k8sCtx.provider),
  })
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
    override: module.spec.namespace,
    projectName: ctx.projectName,
    provider,
    skipCreate,
  })
}
