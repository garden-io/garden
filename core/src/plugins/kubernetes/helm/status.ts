/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ForwardablePort, ServiceIngress, DeployState, ServiceStatus } from "../../../types/service.js"
import type { Log } from "../../../logger/log-entry.js"
import { helm } from "./helm-cli.js"
import type { HelmGardenMetadataConfigMapData } from "./common.js"
import { getReleaseName, loadTemplate } from "./common.js"
import type { KubernetesPluginContext } from "../config.js"
import { getForwardablePorts } from "../port-forward.js"
import type { KubernetesResource, KubernetesServerResource } from "../types.js"
import { getActionNamespace } from "../namespace.js"
import { isWorkload } from "../util.js"
import { getDeployedResource } from "../status/status.js"
import { KubeApi, KubernetesError } from "../api.js"
import { getK8sIngresses } from "../status/ingress.js"
import type { DeployActionHandler } from "../../../plugin/action-types.js"
import type { HelmDeployAction } from "./config.js"
import type { ActionMode, Resolved } from "../../../actions/types.js"
import { deployStateToActionState } from "../../../plugin/handlers/Deploy/get-status.js"
import { isTruthy } from "../../../util/util.js"
import { ChildProcessError, RuntimeError } from "../../../exceptions.js"
import { gardenAnnotationKey } from "../../../util/annotations.js"
import { deserializeValues } from "../../../util/serialization.js"

export const gardenCloudAECPauseAnnotation = gardenAnnotationKey("aec-status")

export const helmStatusMap: { [status: string]: DeployState } = {
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

export const getHelmDeployStatus: DeployActionHandler<"getStatus", HelmDeployAction> = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  const releaseName = getReleaseName(action)

  const detail: HelmStatusDetail = {}
  let state: DeployState
  let helmStatus: ServiceStatus

  const mode = action.mode()
  let deployedMode: ActionMode = "default"

  try {
    helmStatus = await getReleaseStatus({ ctx: k8sCtx, action, releaseName, log })
    state = helmStatus.state
    deployedMode = helmStatus.detail.mode || "default"
  } catch (err) {
    state = "missing"
  }

  let forwardablePorts: ForwardablePort[] = []
  let ingresses: ServiceIngress[] = []

  const spec = action.getSpec()

  if (state !== "missing") {
    const deployedResources = await getDeployedChartResources({ ctx: k8sCtx, action, releaseName, log })

    detail.remoteResources = deployedResources

    forwardablePorts = getForwardablePorts({ resources: deployedResources, parentAction: action })
    ingresses = getK8sIngresses(deployedResources)

    if (state === "ready") {
      if (mode === "sync" && spec.sync?.paths && deployedMode !== mode) {
        // TODO: might want to check every target resource here
        state = "outdated"
      }
    }
  }

  return {
    state: deployStateToActionState(state),
    detail: {
      forwardablePorts,
      state,
      version: state === "ready" ? action.versionString(log) : undefined,
      detail,
      mode: deployedMode,
      ingresses,
    },
    // TODO-0.13.1
    outputs: {},
  }
}

/**
 * Renders the chart for the provided Helm Deploy and fetches all matching resources for the rendered manifests
 * from the cluster.
 */
export async function getDeployedChartResources({
  ctx,
  releaseName,
  log,
  action,
}: {
  ctx: KubernetesPluginContext
  releaseName: string
  log: Log
  action: Resolved<HelmDeployAction>
}): Promise<KubernetesResource[]> {
  const manifests = await getRenderedResources({ ctx, action, releaseName, log })
  const deployedResources = (
    await Promise.all(manifests.map((resource) => getDeployedResource(ctx, ctx.provider, resource, log)))
  ).filter(isTruthy)
  return deployedResources
}

export async function getRenderedResources({
  ctx,
  releaseName,
  log,
  action,
}: {
  ctx: KubernetesPluginContext
  releaseName: string
  log: Log
  action: Resolved<HelmDeployAction>
}): Promise<KubernetesResource[]> {
  const namespace = await getActionNamespace({
    ctx,
    log,
    action,
    provider: ctx.provider,
  })

  return loadTemplate(
    await helm({
      ctx,
      log,
      namespace,
      args: ["get", "manifest", releaseName],
      emitLogEvents: true,
    })
  )
}

export async function getReleaseStatus({
  ctx,
  action,
  releaseName,
  log,
}: {
  ctx: KubernetesPluginContext
  action: Resolved<HelmDeployAction>
  releaseName: string
  log: Log
}): Promise<ServiceStatus> {
  let state: DeployState = "unknown"
  let gardenMetadata: HelmGardenMetadataConfigMapData
  const namespace = await getActionNamespace({
    ctx,
    log,
    action,
    provider: ctx.provider,
  })

  try {
    log.silly(() => `Getting the release status for ${releaseName}`)
    const res = JSON.parse(
      await helm({
        ctx,
        log,
        namespace,
        args: ["status", releaseName, "--output", "json"],
        // do not send JSON output to Garden Cloud or CLI verbose log
        emitLogEvents: false,
      })
    )
    state = helmStatusMap[res.info.status] || "unknown"
  } catch (err) {
    if (!(err instanceof ChildProcessError)) {
      throw err
    }
    if (err.message.includes("release: not found")) {
      return { state: "missing", detail: {} }
    } else {
      throw err
    }
  }
  // get garden metadata from configmap in action namespace
  try {
    gardenMetadata = await getHelmGardenMetadataConfigMapData({ ctx, action, log, namespace })
  } catch (err) {
    log.verbose(`No configmap returned for release ${releaseName}. Is this release managed outside of garden?`)
    return { state: "outdated", detail: {} }
  }

  // Make sure the right version is deployed
  const deployedVersion = gardenMetadata.version
  const deployedMode = gardenMetadata.mode

  if (state === "ready") {
    if (action.mode() !== deployedMode || !deployedVersion || deployedVersion !== action.versionString(log)) {
      state = "outdated"
    }
  }

  if (await isPausedByAEC({ ctx, namespace, action, releaseName, log })) {
    state = "outdated"
  }

  return {
    state,
    detail: { gardenMetadata, mode: deployedMode },
  }
}

/**
 *  Returns Helm workload resources that have been marked as "paused" by Garden Cloud's AEC functionality
 */
export async function getResourcesPausedByAEC({
  ctx,
  action,
  namespace,
  releaseName,
  log,
}: {
  ctx: KubernetesPluginContext
  namespace: string
  action: Resolved<HelmDeployAction>
  releaseName: string
  log: Log
}) {
  const api = await KubeApi.factory(log, ctx, ctx.provider)
  const renderedResources = await getRenderedResources({ ctx, action, releaseName, log })
  const workloads = renderedResources.filter(isWorkload)

  const deployedResources = (
    await Promise.all(
      workloads.map(async (workload) => {
        try {
          const resource = await api.readBySpec({ log, namespace, manifest: workload })
          return resource
        } catch (err) {
          // If readBySpec fails with 404 then the resource isn't deployed
          if (err instanceof KubernetesError && err.responseStatusCode === 404) {
            return null
          }
          throw err
        }
      })
    )
  ).filter(isTruthy)

  const pausedWorkloads = deployedResources.filter((resource) => {
    return resource?.metadata?.annotations?.[gardenCloudAECPauseAnnotation] === "paused"
  })

  return pausedWorkloads
}

async function isPausedByAEC({
  ctx,
  action,
  namespace,
  releaseName,
  log,
}: {
  ctx: KubernetesPluginContext
  namespace: string
  action: Resolved<HelmDeployAction>
  releaseName: string
  log: Log
}) {
  return (await getResourcesPausedByAEC({ ctx, action, namespace, releaseName, log })).length > 0
}

export async function getHelmGardenMetadataConfigMapData({
  ctx,
  action,
  log,
  namespace,
}: {
  ctx: KubernetesPluginContext
  action: Resolved<HelmDeployAction>
  log: Log
  namespace: string
}): Promise<HelmGardenMetadataConfigMapData> {
  const api = await KubeApi.factory(log, ctx, ctx.provider)
  const gardenMetadataConfigMap = await api.core.readNamespacedConfigMap({
    name: `garden-helm-metadata-${action.name}`,
    namespace,
  })
  if (!gardenMetadataConfigMap.data) {
    throw new RuntimeError({ message: `Configmap with garden metadata for release ${action.name} is empty` })
  }
  return deserializeValues(gardenMetadataConfigMap.data) as HelmGardenMetadataConfigMapData
}
