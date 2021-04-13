/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceStatus, ServiceState, ForwardablePort, GardenService } from "../../../types/service"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { LogEntry } from "../../../logger/log-entry"
import { helm } from "./helm-cli"
import { HelmModule } from "./config"
import { getReleaseName, loadTemplate } from "./common"
import { KubernetesPluginContext } from "../config"
import { getForwardablePorts } from "../port-forward"
import { KubernetesServerResource } from "../types"
import { getModuleNamespace, getModuleNamespaceStatus } from "../namespace"

const helmStatusMap: { [status: string]: ServiceState } = {
  unknown: "unknown",
  deployed: "ready",
  deleted: "missing",
  superseded: "stopped",
  failed: "unhealthy",
  deleting: "stopped",
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
  const releaseName = getReleaseName(module)

  const detail: HelmStatusDetail = {}
  let state: ServiceState

  const namespaceStatus = await getModuleNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })

  try {
    const helmStatus = await getReleaseStatus({ ctx: k8sCtx, service, releaseName, log, hotReload })
    state = helmStatus.state
  } catch (err) {
    state = "missing"
  }

  let forwardablePorts: ForwardablePort[] = []

  if (state !== "missing") {
    const deployedResources = await getDeployedResources({ ctx: k8sCtx, module, releaseName, log })
    forwardablePorts = getForwardablePorts(deployedResources)
  }

  return {
    forwardablePorts,
    state,
    version: state === "ready" ? service.version : undefined,
    detail,
    namespaceStatuses: [namespaceStatus],
  }
}

export async function getDeployedResources({
  ctx,
  releaseName,
  log,
  module,
}: {
  ctx: KubernetesPluginContext
  releaseName: string
  log: LogEntry
  module: HelmModule
}) {
  const namespace = await getModuleNamespace({
    ctx,
    log,
    module,
    provider: ctx.provider,
  })

  return loadTemplate(
    await helm({
      ctx,
      log,
      namespace,
      args: ["get", "manifest", releaseName],
    })
  )
}

export async function getReleaseStatus({
  ctx,
  service,
  releaseName,
  log,
  hotReload,
}: {
  ctx: KubernetesPluginContext
  service: GardenService
  releaseName: string
  log: LogEntry
  hotReload: boolean
}): Promise<ServiceStatus> {
  try {
    log.silly(`Getting the release status for ${releaseName}`)
    const namespace = await getModuleNamespace({
      ctx,
      log,
      module: service.module,
      provider: ctx.provider,
    })

    const res = JSON.parse(await helm({ ctx, log, namespace, args: ["status", releaseName, "--output", "json"] }))

    let state = helmStatusMap[res.info.status] || "unknown"
    let values = {}

    if (state === "ready") {
      // Make sure the right version is deployed
      values = JSON.parse(
        await helm({
          ctx,
          log,
          namespace,
          args: ["get", "values", releaseName, "--output", "json"],
        })
      )
      const deployedVersion = values[".garden"] && values[".garden"].version
      const hotReloadEnabled = values[".garden"] && values[".garden"].hotReload === true

      if ((hotReload && !hotReloadEnabled) || !deployedVersion || deployedVersion !== service.version) {
        state = "outdated"
      }
    }

    return {
      state,
      detail: { ...res, values },
    }
  } catch (err) {
    if (err.message.includes("release: not found")) {
      return { state: "missing", detail: {} }
    } else {
      throw err
    }
  }
}
