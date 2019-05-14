/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  PrepareEnvironmentParams,
  CleanupEnvironmentParams,
  GetEnvironmentStatusParams,
} from "../../types/plugin/params"
import { KubeApi } from "./api"
import { getAppNamespace, prepareNamespaces, deleteNamespaces } from "./namespace"
import { KubernetesPluginContext } from "./kubernetes"
import { checkTillerStatus, installTiller } from "./helm/tiller"
import {
  prepareSystemServices,
  getSystemServiceStatuses,
  getSystemGarden,
  systemNamespaceUpToDate,
} from "./system"
import { PrimitiveMap } from "../../config/common"
import { DashboardPage } from "../../config/dashboard"
import { EnvironmentStatus } from "../../types/plugin/outputs"

interface GetK8sEnvironmentStatusParams extends GetEnvironmentStatusParams {
  variables?: PrimitiveMap
}

/**
 * Performs the following actions to check environment status:
 *   1. Checks Tiller status in the project namespace
 *   2. Checks Tiller status in the system namespace (if provider has system services)
 *   3. Checks system service statuses (if provider has system services)
 *
 * Returns ready === true if all the above are ready.
 */
export async function getEnvironmentStatus(
  { ctx, log, variables }: GetK8sEnvironmentStatusParams,
): Promise<EnvironmentStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const sysGarden = await getSystemGarden(k8sCtx.provider, variables || {})
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
    const systemServiceStatuses = await getSystemServiceStatuses({
      ctx: k8sCtx,
      log,
      namespace,
      serviceNames: systemServiceNames,
      variables: variables || {},
    })

    systemReady = systemTillerReady && systemServiceStatuses.ready && sysNamespaceUpToDate
    dashboardPages = systemServiceStatuses.dashboardPages
  }

  const detail = { systemReady, projectReady }

  return {
    ready: projectReady && systemReady,
    detail,
    dashboardPages,
  }
}

interface PrepareK8sEnvironmentParams extends PrepareEnvironmentParams {
  variables?: PrimitiveMap
}

/**
 * Performs the following actions to prepare the environment
 *  1. Installs Tiller in project namespace
 *  2. Installs Tiller in system namespace (if provider has system services)
 *  3. Deploys system services (if provider has system services)
 */
export async function prepareEnvironment({ ctx, log, force, status, variables }: PrepareK8sEnvironmentParams) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const systemReady = status.detail && !!status.detail.systemReady && !force

  // Install Tiller to project namespace
  await installTiller({ ctx: k8sCtx, provider: k8sCtx.provider, log, force })

  const systemServiceNames = k8sCtx.provider.config._systemServices

  if (systemServiceNames.length > 0 && !systemReady) {
    // Install Tiller to system namespace
    const sysGarden = await getSystemGarden(k8sCtx.provider, variables || {})
    const sysCtx = <KubernetesPluginContext>sysGarden.getPluginContext(k8sCtx.provider.name)
    await installTiller({ ctx: sysCtx, provider: sysCtx.provider, log, force })

    const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

    // Install system services
    await prepareSystemServices({
      log,
      namespace,
      force,
      ctx: k8sCtx,
      serviceNames: systemServiceNames,
      variables: variables || {},
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
