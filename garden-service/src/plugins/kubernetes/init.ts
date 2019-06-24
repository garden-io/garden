/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi } from "./api"
import { getAppNamespace, prepareNamespaces, deleteNamespaces } from "./namespace"
import { KubernetesPluginContext, KubernetesConfig, KubernetesProvider } from "./config"
import { checkTillerStatus, installTiller } from "./helm/tiller"
import {
  prepareSystemServices,
  getSystemServiceStatus,
  getSystemGarden,
  systemNamespaceUpToDate,
  systemNamespace,
} from "./system"
import { DashboardPage } from "../../config/dashboard"
import { GetEnvironmentStatusParams, EnvironmentStatus } from "../../types/plugin/provider/getEnvironmentStatus"
import { PrepareEnvironmentParams } from "../../types/plugin/provider/prepareEnvironment"
import { CleanupEnvironmentParams } from "../../types/plugin/provider/cleanupEnvironment"
import { millicpuToString, megabytesToString } from "./util"
import chalk from "chalk"

/**
 * Performs the following actions to check environment status:
 *   1. Checks Tiller status in the project namespace
 *   2. Checks Tiller status in the system namespace (if provider has system services)
 *   3. Checks system service statuses (if provider has system services)
 *
 * Returns ready === true if all the above are ready.
 */
export async function getEnvironmentStatus({ ctx, log }: GetEnvironmentStatusParams): Promise<EnvironmentStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const variables = getVariables(k8sCtx.provider.config)

  const sysGarden = await getSystemGarden(k8sCtx, variables || {})
  const sysCtx = <KubernetesPluginContext>await sysGarden.getPluginContext(k8sCtx.provider.name)

  let systemReady = true
  let projectReady = true
  let dashboardPages: DashboardPage[] = []

  // Ensure project and system namespaces. We need the system namespace independent of system services
  // because we store test results in the system metadata namespace.
  await prepareNamespaces({ ctx, log })
  await prepareNamespaces({ ctx: sysCtx, log })

  // Check Tiller status in project namespace
  if (await checkTillerStatus(k8sCtx, k8sCtx.provider, log) !== "ready") {
    projectReady = false
  }

  const systemServiceNames = k8sCtx.provider.config._systemServices
  let needManualInit = false

  const detail = { systemReady, projectReady, serviceStatuses: {}, systemServiceState: "unknown" }

  if (systemServiceNames.length > 0) {
    // Check Tiller status in system namespace
    let systemTillerReady = true
    if (await checkTillerStatus(sysCtx, sysCtx.provider, log) !== "ready") {
      systemTillerReady = false
    }

    const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
    const api = await KubeApi.factory(log, k8sCtx.provider.config.context)
    const contextForLog = `Checking environment status for plugin "${ctx.provider.name}"`
    const sysNamespaceUpToDate = await systemNamespaceUpToDate(api, log, namespace, contextForLog)

    // Get system service statuses
    const systemServiceStatus = await getSystemServiceStatus({
      ctx: k8sCtx,
      log,
      sysGarden,
      namespace,
      serviceNames: systemServiceNames,
    })

    // We require manual init if we're installing any system services to remote clusters, to avoid conflicts
    // between users or unnecessary work.
    needManualInit = checkManualInit(k8sCtx.provider)
    systemReady = systemTillerReady && sysNamespaceUpToDate && systemServiceStatus.state === "ready"
    dashboardPages = systemServiceStatus.dashboardPages

    // If we require manual init and system services are ready OR outdated but none are *missing*, we warn
    // in the prepareEnvironment handler, instead of flagging as not ready here. This avoids blocking users where
    // there's variance in configuration between users of the same cluster, that most likely shouldn't affect usage.
    const states = Object.values(systemServiceStatus.serviceStatuses).map(s => s.state)
    if (
      (systemServiceStatus.state === "outdated" && !states.includes("missing"))
      || systemServiceStatus.state === "ready"
    ) {
      needManualInit = false
    }

    detail.systemReady = systemReady
    detail.serviceStatuses = systemServiceStatus.serviceStatuses
    detail.systemServiceState = systemServiceStatus.state
  }

  return {
    ready: projectReady && systemReady,
    detail,
    dashboardPages,
    needManualInit,
  }
}

function checkManualInit(provider: KubernetesProvider) {
  return provider.name !== "local-kubernetes"
}

/**
 * Performs the following actions to prepare the environment
 *  1. Installs Tiller in project namespace
 *  2. Installs Tiller in system namespace (if provider has system services)
 *  3. Deploys system services (if provider has system services)
 */
export async function prepareEnvironment({ ctx, log, force, manualInit, status }: PrepareEnvironmentParams) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const variables = getVariables(k8sCtx.provider.config)

  // Install Tiller to project namespace
  await installTiller({ ctx: k8sCtx, provider: k8sCtx.provider, log, force })

  const systemReady = status.detail && !!status.detail.systemReady && !force
  const systemServiceNames = k8sCtx.provider.config._systemServices

  if (systemServiceNames.length > 0 && !systemReady) {
    const needManualInit = checkManualInit(k8sCtx.provider)

    if (!manualInit && needManualInit && status.detail && status.detail.systemServiceState === "outdated") {
      log.warn({
        symbol: "warning",
        msg: chalk.yellow(
          "One or more cluster-wide services are outdated or their configuration does not match your current " +
          "configuration. You may want to run \`garden init\` to update them, or contact a cluster admin to do so.",
        ),
      })
      return {}
    }

    // Install Tiller to system namespace
    const sysGarden = await getSystemGarden(k8sCtx, variables || {})
    const sysCtx = <KubernetesPluginContext>await sysGarden.getPluginContext(k8sCtx.provider.name)
    await installTiller({ ctx: sysCtx, provider: sysCtx.provider, log, force })

    const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

    // Install system services
    await prepareSystemServices({
      log,
      sysGarden,
      namespace,
      force,
      ctx: k8sCtx,
      serviceNames: systemServiceNames,
    })
  }

  return {}
}

export async function cleanupEnvironment({ ctx, log }: CleanupEnvironmentParams) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider.config.context)
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const entry = log.info({
    section: "kubernetes",
    msg: `Deleting namespace ${namespace} (this may take a while)`,
    status: "active",
  })

  await deleteNamespaces([namespace], api, entry)

  return {}
}

function getVariables(config: KubernetesConfig) {
  return {
    "namespace": systemNamespace,

    "registry-hostname": getRegistryHostname(),
    "builder-mode": config.buildMode,

    "builder-limits-cpu": millicpuToString(config.resources.builder.limits.cpu),
    "builder-limits-memory": megabytesToString(config.resources.builder.limits.memory),
    "builder-requests-cpu": millicpuToString(config.resources.builder.requests.cpu),
    "builder-requests-memory": megabytesToString(config.resources.builder.requests.memory),
    "builder-storage-size": megabytesToString(config.storage.builder.size),
    "builder-storage-class": config.storage.builder.storageClass,

    "registry-limits-cpu": millicpuToString(config.resources.registry.limits.cpu),
    "registry-limits-memory": megabytesToString(config.resources.registry.limits.memory),
    "registry-requests-cpu": millicpuToString(config.resources.registry.requests.cpu),
    "registry-requests-memory": megabytesToString(config.resources.registry.requests.memory),
    "registry-storage-size": megabytesToString(config.storage.registry.size),
    "registry-storage-class": config.storage.registry.storageClass,

    "sync-limits-cpu": millicpuToString(config.resources.sync.limits.cpu),
    "sync-limits-memory": megabytesToString(config.resources.sync.limits.memory),
    "sync-requests-cpu": millicpuToString(config.resources.sync.requests.cpu),
    "sync-requests-memory": megabytesToString(config.resources.sync.requests.memory),
    "sync-storage-size": megabytesToString(config.storage.sync.size),
    "sync-storage-class": config.storage.sync.storageClass,
  }
}

export function getRegistryHostname() {
  return `garden-docker-registry.${systemNamespace}.svc.cluster.local`
}
