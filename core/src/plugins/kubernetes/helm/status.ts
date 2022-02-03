/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
import { getBaseModule, getReleaseName, loadTemplate } from "./common"
import { KubernetesPluginContext } from "../config"
import { getForwardablePorts } from "../port-forward"
import { KubernetesServerResource } from "../types"
import { getModuleNamespace, getModuleNamespaceStatus } from "../namespace"
import { getServiceResource, getServiceResourceSpec, isWorkload } from "../util"
import { startDevModeSync } from "../dev-mode"
import { isConfiguredForDevMode } from "../status/status"
import { KubeApi } from "../api"
import Bluebird from "bluebird"

export const gardenCloudAECPauseAnnotation = "garden.io/aec-status"

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
  devMode,
  hotReload,
}: GetServiceStatusParams<HelmModule>): Promise<HelmServiceStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const releaseName = getReleaseName(module)

  const detail: HelmStatusDetail = {}
  let state: ServiceState
  let helmStatus: ServiceStatus

  const namespaceStatus = await getModuleNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })

  let deployedWithDevModeOrHotReloading: boolean | undefined

  try {
    helmStatus = await getReleaseStatus({ ctx: k8sCtx, module, service, releaseName, log, devMode, hotReload })
    state = helmStatus.state
    deployedWithDevModeOrHotReloading = helmStatus.devMode
  } catch (err) {
    state = "missing"
  }

  let forwardablePorts: ForwardablePort[] = []

  if (state !== "missing") {
    const deployedResources = await getRenderedResources({ ctx: k8sCtx, module, releaseName, log })
    forwardablePorts = getForwardablePorts(deployedResources, service)

    if (state === "ready" && devMode && service.spec.devMode) {
      // Need to start the dev-mode sync here, since the deployment handler won't be called.
      const baseModule = getBaseModule(module)
      const serviceResourceSpec = getServiceResourceSpec(module, baseModule)
      const target = await getServiceResource({
        ctx: k8sCtx,
        log,
        provider: k8sCtx.provider,
        module,
        manifests: deployedResources,
        resourceSpec: serviceResourceSpec,
      })

      // Make sure we don't fail if the service isn't actually properly configured (we don't want to throw in the
      // status handler, generally)
      if (isConfiguredForDevMode(target)) {
        const namespace =
          target.metadata.namespace ||
          (await getModuleNamespace({
            ctx: k8sCtx,
            log,
            module,
            provider: k8sCtx.provider,
          }))

        await startDevModeSync({
          ctx,
          log,
          moduleRoot: service.sourceModule.path,
          namespace,
          target,
          spec: service.spec.devMode,
          containerName: service.spec.devMode.containerName,
          serviceName: service.name,
        })
      } else {
        state = "outdated"
      }
    }
  }

  return {
    forwardablePorts,
    state,
    version: state === "ready" ? service.version : undefined,
    detail,
    devMode: deployedWithDevModeOrHotReloading,
    namespaceStatuses: [namespaceStatus],
  }
}

export async function getRenderedResources({
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
  module,
  service,
  releaseName,
  log,
  devMode,
  hotReload,
}: {
  ctx: KubernetesPluginContext
  module: HelmModule
  service: GardenService
  releaseName: string
  log: LogEntry
  devMode: boolean
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

    let devModeEnabled = false
    let hotReloadEnabled = false

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
      devModeEnabled = values[".garden"] && values[".garden"].devMode === true
      hotReloadEnabled = values[".garden"] && values[".garden"].hotReload === true

      if (
        (devMode && !devModeEnabled) ||
        (hotReload && !hotReloadEnabled) ||
        !deployedVersion ||
        deployedVersion !== service.version
      ) {
        state = "outdated"
      }

      // If ctx.cloudApi is defined, the user is logged in and they might be trying to deploy to an environment
      // that could have been paused by Garden Cloud's AEC functionality. We therefore make sure to check for
      // the annotations Garden Cloud adds to Helm Deployments and StatefulSets when pausing an environment.
      if (ctx.cloudApi && (await isPaused({ ctx, namespace, module, releaseName, log }))) {
        state = "outdated"
      }
    }

    return {
      state,
      detail: { ...res, values },
      devMode: devModeEnabled || hotReloadEnabled,
    }
  } catch (err) {
    if (err.message.includes("release: not found")) {
      return { state: "missing", detail: {} }
    } else {
      throw err
    }
  }
}

/**
 *  Returns Helm workload resources that have been marked as "paused" by Garden Cloud's AEC functionality
 */
export async function getPausedResources({
  ctx,
  module,
  namespace,
  releaseName,
  log,
}: {
  ctx: KubernetesPluginContext
  namespace: string
  module: HelmModule
  releaseName: string
  log: LogEntry
}) {
  const api = await KubeApi.factory(log, ctx, ctx.provider)
  const renderedResources = await getRenderedResources({ ctx, module, releaseName, log })
  const workloads = renderedResources.filter(isWorkload)
  const deployedResources = await Bluebird.all(
    workloads.map((workload) => api.readBySpec({ log, namespace, manifest: workload }))
  )

  const pausedWorkloads = deployedResources.filter((resource) => {
    return resource?.metadata?.annotations?.[gardenCloudAECPauseAnnotation] === "paused"
  })
  return pausedWorkloads
}

async function isPaused({
  ctx,
  module,
  namespace,
  releaseName,
  log,
}: {
  ctx: KubernetesPluginContext
  namespace: string
  module: HelmModule
  releaseName: string
  log: LogEntry
}) {
  return (await getPausedResources({ ctx, module, namespace, releaseName, log })).length > 0
}
