/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceStatus, ServiceState } from "../../../types/service"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { getExecModuleBuildStatus } from "../../exec"
import { compareDeployedObjects } from "../status/status"
import { KubeApi } from "../api"
import { getAppNamespace } from "../namespace"
import { LogEntry } from "../../../logger/log-entry"
import { helm } from "./helm-cli"
import { HelmModule } from "./config"
import { getChartResources, findServiceResource } from "./common"
import { buildHelmModule } from "./build"
import { configureHotReload } from "../hot-reload"
import { getHotReloadSpec } from "./hot-reload"
import { KubernetesPluginContext } from "../config"
import { getForwardablePorts } from "../port-forward"

const helmStatusCodeMap: { [code: number]: ServiceState } = {
  // see https://github.com/kubernetes/helm/blob/master/_proto/hapi/release/status.proto
  0: "unknown",   // UNKNOWN
  1: "ready",     // DEPLOYED
  2: "missing",   // DELETED
  3: "stopped",   // SUPERSEDED
  4: "unhealthy", // FAILED
  5: "stopped",   // DELETING
  6: "deploying", // PENDING_INSTALL
  7: "deploying", // PENDING_UPGRADE
  8: "deploying", // PENDING_ROLLBACK
}

export async function getServiceStatus(
  { ctx, module, service, log, hotReload }: GetServiceStatusParams<HelmModule>,
): Promise<ServiceStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  // need to build to be able to check the status
  const buildStatus = await getExecModuleBuildStatus({ ctx: k8sCtx, module, log })
  if (!buildStatus.ready) {
    await buildHelmModule({ ctx: k8sCtx, module, log })
  }

  // first check if the installed objects on the cluster match the current code
  const chartResources = await getChartResources(k8sCtx, module, log)

  if (hotReload) {
    const target = await findServiceResource({ ctx: k8sCtx, log, chartResources, module })
    const hotReloadSpec = getHotReloadSpec(service)
    const resourceSpec = module.spec.serviceResource!

    configureHotReload({
      target,
      hotReloadSpec,
      hotReloadArgs: resourceSpec.hotReloadArgs,
      containerName: resourceSpec.containerName,
    })
  }

  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, provider.config.context)
  const namespace = await getAppNamespace(k8sCtx, log, provider)

  let { state, remoteObjects } = await compareDeployedObjects(k8sCtx, api, namespace, chartResources, log, false)

  const forwardablePorts = getForwardablePorts(remoteObjects)

  const detail = { remoteObjects }

  return {
    forwardablePorts,
    state,
    version: state === "ready" ? module.version.versionString : undefined,
    detail,
  }
}

export async function getReleaseStatus(
  namespace: string, context: string, releaseName: string, log: LogEntry,
): Promise<ServiceStatus> {
  try {
    log.silly(`Getting the release status for ${releaseName}`)
    const res = JSON.parse(await helm(namespace, context, log, "status", releaseName, "--output", "json"))
    const statusCode = res.info.status.code
    return {
      state: helmStatusCodeMap[statusCode],
      detail: res,
    }
  } catch (_) {
    // release doesn't exist
    return { state: "missing" }
  }
}
