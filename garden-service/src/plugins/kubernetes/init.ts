/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi, KubernetesError } from "./api"
import { getAppNamespace, prepareNamespaces, deleteNamespaces } from "./namespace"
import { KubernetesPluginContext, KubernetesConfig } from "./config"
import { checkTillerStatus, installTiller } from "./helm/tiller"
import {
  prepareSystemServices,
  getSystemServiceStatus,
  getSystemGarden,
  systemNamespaceUpToDate,
  systemNamespace,
} from "./system"
import { GetEnvironmentStatusParams, EnvironmentStatus } from "../../types/plugin/provider/getEnvironmentStatus"
import { PrepareEnvironmentParams, PrepareEnvironmentResult } from "../../types/plugin/provider/prepareEnvironment"
import { CleanupEnvironmentParams } from "../../types/plugin/provider/cleanupEnvironment"
import { millicpuToString, megabytesToString } from "./util"
import chalk from "chalk"
import { deline } from "../../util/string"
import { combineStates, ServiceStatusMap } from "../../types/service"

// Note: We need to increment a version number here if we ever make breaking changes to the NFS provisioner StatefulSet
const nfsStorageClass = "garden-system-nfs-v2"

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
  const provider = k8sCtx.provider

  let projectReady = true

  const namespaces = await prepareNamespaces({ ctx, log })

  // Check Tiller status in project namespace
  if (await checkTillerStatus(k8sCtx, log) !== "ready") {
    projectReady = false
  }

  const systemServiceNames = k8sCtx.provider.config._systemServices

  const detail = {
    projectReady,
    serviceStatuses: {},
    systemReady: true,
    systemServiceState: "unknown",
    systemTillerReady: true,
  }

  const result: EnvironmentStatus = {
    ready: projectReady,
    detail,
    dashboardPages: [],
    outputs: {
      ...namespaces,
      "default-hostname": provider.config.defaultHostname || null,
    },
  }

  if (
    // No need to continue if we don't need any system services
    systemServiceNames.length === 0
    ||
    // Make sure we don't recurse infinitely
    provider.config.namespace === systemNamespace
  ) {
    return result
  }

  const variables = getKubernetesSystemVariables(provider.config)
  const sysGarden = await getSystemGarden(k8sCtx, variables || {}, log)
  const sysProvider = await sysGarden.resolveProvider(provider.name)
  const sysCtx = <KubernetesPluginContext>await sysGarden.getPluginContext(sysProvider)

  // Check Tiller status in system namespace
  const tillerStatus = await checkTillerStatus(sysCtx, log)

  if (tillerStatus !== "ready") {
    result.ready = false
    detail.systemTillerReady = false
  }

  const api = await KubeApi.factory(log, provider)
  const contextForLog = `Checking Garden system service status for plugin "${ctx.provider.name}"`
  const sysNamespaceUpToDate = await systemNamespaceUpToDate(api, log, systemNamespace, contextForLog)

  // Get system service statuses
  const systemServiceStatus = await getSystemServiceStatus({
    ctx: k8sCtx,
    log,
    sysGarden,
    namespace: systemNamespace,
    serviceNames: systemServiceNames,
  })

  if (!sysNamespaceUpToDate || systemServiceStatus.state !== "ready") {
    result.ready = false
    detail.systemReady = false
  }

  result.dashboardPages!.push(...systemServiceStatus.dashboardPages)

  detail.serviceStatuses = systemServiceStatus.serviceStatuses
  detail.systemServiceState = systemServiceStatus.state

  sysGarden.log.setSuccess()

  return result
}

/**
 * Performs the following actions to prepare the environment
 *  1. Installs Tiller in project namespace
 *  2. Installs Tiller in system namespace (if provider has system services)
 *  3. Deploys system services (if provider has system services)
 */
export async function prepareEnvironment(params: PrepareEnvironmentParams): Promise<PrepareEnvironmentResult> {
  const { ctx, log, force, status } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  // Install Tiller to project namespace
  await installTiller({ ctx: k8sCtx, provider: k8sCtx.provider, log, force })

  // Prepare system services
  await prepareSystem({ ...params, clusterInit: false })

  return { status: { ready: true, outputs: status.outputs } }
}

export async function prepareSystem(
  { ctx, log, force, status, clusterInit }: PrepareEnvironmentParams & { clusterInit: boolean },
) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const variables = getKubernetesSystemVariables(provider.config)

  const systemReady = status.detail && !!status.detail.systemReady && !force
  const systemServiceNames = k8sCtx.provider.config._systemServices

  if (systemServiceNames.length === 0 || systemReady) {
    return {}
  }

  const serviceStatuses: ServiceStatusMap = (status.detail && status.detail.serviceStatuses) || {}
  const serviceStates = Object.values(serviceStatuses).map(s => (s && s.state) || "unknown")
  const combinedState = combineStates(serviceStates)

  const remoteCluster = provider.name !== "local-kubernetes"

  // If we require manual init and system services are ready OR outdated but none are *missing*, we warn
  // in the prepareEnvironment handler, instead of flagging as not ready here. This avoids blocking users where
  // there's variance in configuration between users of the same cluster, that often doesn't affect usage.
  if (!clusterInit && remoteCluster) {
    if (
      combinedState === "outdated" &&
      !serviceStates.includes("missing") &&
      !(ctx.command && ctx.command.name === "plugins" && ctx.command.args.command === "cluster-init")
    ) {
      log.warn({
        symbol: "warning",
        msg: chalk.yellow(deline`
          One or more cluster-wide system services are outdated or their configuration does not match your current
          configuration. You may want to run \`garden --env=${ctx.environmentName} plugins kubernetes cluster-init\`
          to update them, or contact a cluster admin to do so.
        `),
      })
    }
    return {}
  }

  // We require manual init if we're installing any system services to remote clusters, to avoid conflicts
  // between users or unnecessary work.
  if (!clusterInit && remoteCluster && !systemReady) {
    throw new KubernetesError(deline`
      One or more cluster-wide system services are missing or not ready. You need to run
      \`garden --env=${ctx.environmentName} plugins kubernetes cluster-init\`
      to initialize them, or contact a cluster admin to do so, before deploying services to this cluster.
    `, {
      status,
    })
  }

  // Install Tiller to system namespace
  const sysGarden = await getSystemGarden(k8sCtx, variables || {}, log)
  const sysProvider = await sysGarden.resolveProvider(k8sCtx.provider.name)
  const sysCtx = <KubernetesPluginContext>await sysGarden.getPluginContext(sysProvider)

  await sysGarden.clearBuilds()

  await installTiller({ ctx: sysCtx, provider: sysCtx.provider, log, force })

  // We need to install the NFS provisioner separately, so that we can optionally install it
  // FIXME: when we've added an `enabled` field, we should get rid of this special case
  if (systemServiceNames.includes("nfs-provisioner")) {
    await prepareSystemServices({
      log,
      sysGarden,
      namespace: systemNamespace,
      force,
      ctx: k8sCtx,
      serviceNames: ["nfs-provisioner"],
    })
  }

  // Install system services
  await prepareSystemServices({
    log,
    sysGarden,
    namespace: systemNamespace,
    force,
    ctx: k8sCtx,
    serviceNames: systemServiceNames.filter(name => name !== "nfs-provisioner"),
  })

  sysGarden.log.setSuccess()

  return {}
}

export async function cleanupEnvironment({ ctx, log }: CleanupEnvironmentParams) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider)
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const entry = log.info({
    section: "kubernetes",
    msg: `Deleting namespace ${namespace} (this may take a while)`,
    status: "active",
  })

  await deleteNamespaces([namespace], api, entry)

  return {}
}

export function getKubernetesSystemVariables(config: KubernetesConfig) {
  const syncStorageClass = config.storage.sync.storageClass || nfsStorageClass

  return {
    "namespace": systemNamespace,

    "registry-hostname": getRegistryHostname(),
    "builder-mode": config.buildMode,

    "builder-limits-cpu": millicpuToString(config.resources.builder.limits.cpu),
    "builder-limits-memory": megabytesToString(config.resources.builder.limits.memory),
    "builder-requests-cpu": millicpuToString(config.resources.builder.requests.cpu),
    "builder-requests-memory": megabytesToString(config.resources.builder.requests.memory),
    "builder-storage-size": megabytesToString(config.storage.builder.size!),
    "builder-storage-class": config.storage.builder.storageClass,

    // We only use NFS for the build-sync volume, so we allocate the space we need for that plus 1GB for margin.
    "nfs-storage-size": megabytesToString(config.storage.sync.size! + 1024),
    "nfs-storage-class": config.storage.nfs.storageClass,

    "registry-limits-cpu": millicpuToString(config.resources.registry.limits.cpu),
    "registry-limits-memory": megabytesToString(config.resources.registry.limits.memory),
    "registry-requests-cpu": millicpuToString(config.resources.registry.requests.cpu),
    "registry-requests-memory": megabytesToString(config.resources.registry.requests.memory),
    "registry-storage-size": megabytesToString(config.storage.registry.size!),
    "registry-storage-class": config.storage.registry.storageClass,

    "sync-limits-cpu": millicpuToString(config.resources.sync.limits.cpu),
    "sync-limits-memory": megabytesToString(config.resources.sync.limits.memory),
    "sync-requests-cpu": millicpuToString(config.resources.sync.requests.cpu),
    "sync-requests-memory": megabytesToString(config.resources.sync.requests.memory),
    "sync-storage-size": megabytesToString(config.storage.sync.size!),
    "sync-storage-class": syncStorageClass,
    "sync-volume-name": `garden-sync-${syncStorageClass}`,
  }
}

export function getRegistryHostname() {
  return `garden-docker-registry.${systemNamespace}.svc.cluster.local`
}
