/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceStatus, ServiceState } from "../../../types/service"
import { GetServiceStatusParams } from "../../../types/plugin/params"
import { getExecModuleBuildStatus } from "../../exec"
import { compareDeployedObjects } from "../status"
import { KubeApi } from "../api"
import { getAppNamespace } from "../namespace"
import { LogEntry } from "../../../logger/log-entry"
import { helm } from "./helm-cli"
import { HelmModule } from "./config"
import { getChartResources, findServiceResource } from "./common"
import { buildHelmModule } from "./build"
import { configureHotReload } from "../hot-reload"
import { getHotReloadSpec } from "./hot-reload"

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
  // need to build to be able to check the status
  const buildStatus = await getExecModuleBuildStatus({ ctx, module, log })
  if (!buildStatus.ready) {
    await buildHelmModule({ ctx, module, log })
  }

  // first check if the installed objects on the cluster match the current code
  const chartResources = await getChartResources(ctx, module, log)

  if (hotReload) {
    const target = await findServiceResource({ ctx, log, chartResources, module })
    const hotReloadSpec = getHotReloadSpec(service)
    const resourceSpec = module.spec.serviceResource!

    configureHotReload({
      target,
      hotReloadSpec,
      hotReloadArgs: resourceSpec.hotReloadArgs,
      containerName: resourceSpec.containerName,
    })
  }

  const api = new KubeApi(ctx.provider)
  const namespace = await getAppNamespace(ctx, ctx.provider)
  let { state, remoteObjects } = await compareDeployedObjects(ctx, api, namespace, chartResources, log)
  const detail = { remoteObjects }

  return {
    state,
    version: state === "ready" ? module.version.versionString : undefined,
    detail,
  }
}

export async function getReleaseStatus(
  namespace: string, context: string, releaseName: string, log: LogEntry,
): Promise<ServiceStatus> {
  try {
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
