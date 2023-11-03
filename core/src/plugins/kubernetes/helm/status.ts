/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ForwardablePort, ServiceIngress, DeployState, ServiceStatus } from "../../../types/service"
import { Log } from "../../../logger/log-entry"
import { helm } from "./helm-cli"
import { getReleaseName, loadTemplate } from "./common"
import { KubernetesPluginContext } from "../config"
import { getForwardablePorts } from "../port-forward"
import { KubernetesResource, KubernetesServerResource } from "../types"
import { getActionNamespace } from "../namespace"
import { getTargetResource, isWorkload } from "../util"
import { getDeployedResource, isConfiguredForLocalMode } from "../status/status"
import { KubeApi } from "../api"
import { getK8sIngresses } from "../status/ingress"
import { DeployActionHandler } from "../../../plugin/action-types"
import { HelmDeployAction } from "./config"
import { ActionMode, Resolved } from "../../../actions/types"
import { deployStateToActionState } from "../../../plugin/handlers/Deploy/get-status"
import { isTruthy } from "../../../util/util"
import { ChildProcessError } from "../../../exceptions"
import { gardenAnnotationKey } from "../../../util/string"

export const gardenCloudAECPauseAnnotation = gardenAnnotationKey("aec-status")

const helmStatusMap: { [status: string]: DeployState } = {
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
  const provider = k8sCtx.provider

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

    forwardablePorts = getForwardablePorts({ resources: deployedResources, parentAction: action, mode: deployedMode })
    ingresses = getK8sIngresses(deployedResources, provider)

    if (state === "ready") {
      // Local mode always takes precedence over sync mode
      if (mode === "local" && spec.localMode) {
        const query = spec.localMode.target || spec.defaultTarget

        // If no target is set, a warning is emitted during deployment
        if (query) {
          const target = await getTargetResource({
            ctx: k8sCtx,
            log,
            provider: k8sCtx.provider,
            action,
            manifests: deployedResources,
            query,
          })

          if (!isConfiguredForLocalMode(target)) {
            state = "outdated"
          }
        }
      } else if (mode === "sync" && spec.sync?.paths && deployedMode !== mode) {
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
      version: state === "ready" ? action.versionString() : undefined,
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
  try {
    log.silly(`Getting the release status for ${releaseName}`)
    const namespace = await getActionNamespace({
      ctx,
      log,
      action,
      provider: ctx.provider,
    })

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

    let state = helmStatusMap[res.info.status] || "unknown"
    let values = {}

    let deployedMode: ActionMode = "default"

    if (state === "ready") {
      // Make sure the right version is deployed
      const helmResponse = await helm({
        ctx,
        log,
        namespace,
        args: ["get", "values", releaseName, "--output", "json"],
        // do not send JSON output to Garden Cloud or CLI verbose log
        emitLogEvents: false,
      })
      values = JSON.parse(helmResponse)

      let deployedVersion: string | undefined = undefined
      // JSON.parse can return null
      if (values === null) {
        log.verbose(`No helm values returned for release ${releaseName}. Is this release managed outside of garden?`)
        state = "outdated"
      } else {
        deployedVersion = values[".garden"]?.version
        deployedMode = values[".garden"]?.mode

        if (action.mode() !== deployedMode || !deployedVersion || deployedVersion !== action.versionString()) {
          state = "outdated"
        }
      }

      // If ctx.cloudApi is defined, the user is logged in and they might be trying to deploy to an environment
      // that could have been paused by Garden Cloud's AEC functionality. We therefore make sure to check for
      // the annotations Garden Cloud adds to Helm Deployments and StatefulSets when pausing an environment.
      if (ctx.cloudApi && (await isPaused({ ctx, namespace, action, releaseName, log }))) {
        state = "outdated"
      }
    }

    return {
      state,
      detail: { ...res, values, mode: deployedMode },
    }
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
}

/**
 *  Returns Helm workload resources that have been marked as "paused" by Garden Cloud's AEC functionality
 */
export async function getPausedResources({
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
  const deployedResources = await Promise.all(
    workloads.map((workload) => api.readBySpec({ log, namespace, manifest: workload }))
  )

  const pausedWorkloads = deployedResources.filter((resource) => {
    return resource?.metadata?.annotations?.[gardenCloudAECPauseAnnotation] === "paused"
  })
  return pausedWorkloads
}

async function isPaused({
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
  return (await getPausedResources({ ctx, action, namespace, releaseName, log })).length > 0
}
