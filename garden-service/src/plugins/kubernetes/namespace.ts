/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import { intersection } from "lodash"

import { PluginContext } from "../../plugin-context"
import { KubeApi } from "./api"
import { KubernetesProvider, KubernetesPluginContext } from "./config"
import { name as providerName } from "./kubernetes"
import { AuthenticationError, DeploymentError, TimeoutError } from "../../exceptions"
import { getPackageVersion, sleep } from "../../util/util"
import { GetEnvironmentStatusParams } from "../../types/plugin/provider/getEnvironmentStatus"
import { kubectl, KUBECTL_DEFAULT_TIMEOUT } from "./kubectl"
import { LogEntry } from "../../logger/log-entry"
import { ConfigStore } from "../../config-store"
import { gardenAnnotationKey } from "../../util/string"

const GARDEN_VERSION = getPackageVersion()
type CreateNamespaceStatus = "pending" | "created"
const created: { [name: string]: CreateNamespaceStatus } = {}

export async function ensureNamespace(api: KubeApi, namespace: string) {
  if (!created[namespace]) {
    created[namespace] = "pending"
    const namespacesStatus = await api.core.listNamespace()

    for (const n of namespacesStatus.body.items) {
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
  configStore: ConfigStore,
  log: LogEntry,
  projectName: string,
  provider: KubernetesProvider,
  suffix?: string,
  skipCreate?: boolean,
}

export async function getNamespace(
  { projectName, configStore: localConfigStore, log, provider, suffix, skipCreate }: GetNamespaceParams,
): Promise<string> {
  let namespace

  if (provider.config.namespace !== undefined) {
    namespace = provider.config.namespace
  } else {
    // Note: The local-kubernetes always defines a namespace name, so this logic only applies to the kubernetes provider
    // TODO: Move this logic out to the kubernetes plugin init/validation
    const localConfig = await localConfigStore.get()
    const k8sConfig = localConfig.kubernetes || {}
    let { username, ["previous-usernames"]: previousUsernames } = k8sConfig

    if (!username) {
      username = provider.config.defaultUsername
    }

    if (!username) {
      throw new AuthenticationError(
        `User not logged into provider ${providerName}. Please specify defaultUsername in provider ` +
        `config or run garden init.`,
        { previousUsernames, provider: providerName },
      )
    }

    namespace = `${username}--${projectName}`
  }

  if (suffix) {
    namespace = `${namespace}--${suffix}`
  }

  if (!skipCreate) {
    const api = await KubeApi.factory(log, provider.config.context)
    await ensureNamespace(api, namespace)
  }

  return namespace
}

export async function getAppNamespace(ctx: PluginContext, log: LogEntry, provider: KubernetesProvider) {
  return getNamespace({
    configStore: ctx.configStore,
    log,
    projectName: ctx.projectName,
    provider,
  })
}

export function getMetadataNamespace(ctx: PluginContext, log: LogEntry, provider: KubernetesProvider) {
  return getNamespace({
    configStore: ctx.configStore,
    log,
    projectName: ctx.projectName,
    provider,
    suffix: "metadata",
  })
}

export async function getAllNamespaces(api: KubeApi): Promise<string[]> {
  const allNamespaces = await api.core.listNamespace()
  return allNamespaces.body.items
    .map(n => n.metadata.name)
}

/**
 * Used by both the remote and local plugin
 */
export async function prepareNamespaces({ ctx, log }: GetEnvironmentStatusParams) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const kubeContext = k8sCtx.provider.config.context

  try {
    // TODO: use API instead of kubectl (I just couldn't find which API call to make)
    await kubectl.exec({ log, context: kubeContext, args: ["version"] })
  } catch (err) {
    let message = err.message
    if (err.stdout) {
      message += err.stdout
    }
    if (err.stderr) {
      message += err.stderr
    }
    throw new DeploymentError(
      `Unable to connect to Kubernetes cluster. ` +
      `Please make sure it is running, reachable and that you have the right context configured.`,
      {
        kubeContext,
        message,
      },
    )
  }

  await Bluebird.all([
    getMetadataNamespace(k8sCtx, log, k8sCtx.provider),
    getAppNamespace(k8sCtx, log, k8sCtx.provider),
  ])
}

export async function deleteNamespaces(namespaces: string[], api: KubeApi, log?: LogEntry) {
  for (const ns of namespaces) {
    try {
      // Note: Need to call the delete method with an empty object
      // TODO: any cast is required until https://github.com/kubernetes-client/javascript/issues/52 is fixed
      await api.core.deleteNamespace(ns, <any>{})
    } catch (err) {
      // Ignore not found errors.
      if (err.code !== 404) {
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
      throw new TimeoutError(
        `Timed out waiting for namespace ${namespaces.join(", ")} delete to complete`,
        { namespaces },
      )
    }
  }
}
