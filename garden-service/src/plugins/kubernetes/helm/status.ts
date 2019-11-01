/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceStatus, ServiceState } from "../../../types/service"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { compareDeployedResources } from "../status/status"
import { KubeApi } from "../api"
import { getAppNamespace } from "../namespace"
import { LogEntry } from "../../../logger/log-entry"
import { helm } from "./helm-cli"
import { HelmModule } from "./config"
import { getChartResources, findServiceResource, getReleaseName } from "./common"
import { buildHelmModule } from "./build"
import { configureHotReload } from "../hot-reload"
import { getHotReloadSpec } from "./hot-reload"
import { KubernetesPluginContext } from "../config"
import { getForwardablePorts } from "../port-forward"
import { KubernetesServerResource } from "../types"

const helmStatusCodeMap: { [code: number]: ServiceState } = {
  // see https://github.com/kubernetes/helm/blob/master/_proto/hapi/release/status.proto
  0: "unknown", // UNKNOWN
  1: "ready", // DEPLOYED
  2: "missing", // DELETED
  3: "stopped", // SUPERSEDED
  4: "unhealthy", // FAILED
  5: "stopped", // DELETING
  6: "deploying", // PENDING_INSTALL
  7: "deploying", // PENDING_UPGRADE
  8: "deploying", // PENDING_ROLLBACK
}

interface HelmStatusDetail {
  remoteResources?: KubernetesServerResource[]
}

export type HelmServiceStatus = ServiceStatus<HelmStatusDetail>

export async function getServiceStatus({
  ctx,
  module,
  service,
  log,
  hotReload,
}: GetServiceStatusParams<HelmModule>): Promise<HelmServiceStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  // need to build to be able to check the status
  await buildHelmModule({ ctx: k8sCtx, module, log })

  // first check if the installed objects on the cluster match the current code
  const chartResources = await getChartResources(k8sCtx, module, log)
  const provider = k8sCtx.provider
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const releaseName = getReleaseName(module)

  const detail: HelmStatusDetail = {}
  let state: ServiceState

  if (hotReload) {
    // If we're running with hot reload enabled, we need to alter the appropriate resources and then compare directly.
    const target = await findServiceResource({ ctx: k8sCtx, log, chartResources, module })
    const hotReloadSpec = getHotReloadSpec(service)
    const resourceSpec = module.spec.serviceResource!

    configureHotReload({
      target,
      hotReloadSpec,
      hotReloadArgs: resourceSpec.hotReloadArgs,
      containerName: resourceSpec.containerName,
    })

    const api = await KubeApi.factory(log, provider)

    const comparison = await compareDeployedResources(k8sCtx, api, namespace, chartResources, log)
    state = comparison.state
    detail.remoteResources = comparison.remoteResources
  } else {
    // Otherwise we trust Helm to report the status of the chart.
    try {
      const helmStatus = await getReleaseStatus(k8sCtx, releaseName, log)
      state = helmStatus.state
    } catch (err) {
      state = "missing"
    }
  }

  const forwardablePorts = getForwardablePorts(chartResources)

  return {
    forwardablePorts,
    state,
    version: state === "ready" ? module.version.versionString : undefined,
    detail,
  }
}

export async function getReleaseStatus(
  ctx: KubernetesPluginContext,
  releaseName: string,
  log: LogEntry
): Promise<ServiceStatus> {
  try {
    log.silly(`Getting the release status for ${releaseName}`)
    const res = JSON.parse(await helm({ ctx, log, args: ["status", releaseName, "--output", "json"] }))
    const statusCode = res.info.status.code
    return {
      state: helmStatusCodeMap[statusCode],
      detail: res,
    }
  } catch (_) {
    // release doesn't exist
    return { state: "missing", detail: {} }
  }
}
