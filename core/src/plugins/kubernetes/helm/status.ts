/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  ForwardablePort,
  ServiceIngress,
  ServiceState,
  serviceStateToActionState,
  ServiceStatus,
} from "../../../types/service"
import { Log } from "../../../logger/log-entry"
import { helm } from "./helm-cli"
import { getReleaseName, loadTemplate } from "./common"
import { KubernetesPluginContext } from "../config"
import { getForwardablePorts } from "../port-forward"
import { KubernetesServerResource } from "../types"
import { getActionNamespace, getActionNamespaceStatus } from "../namespace"
import { getTargetResource, isWorkload } from "../util"
import { startSyncs } from "../sync"
import { isConfiguredForLocalMode } from "../status/status"
import { KubeApi } from "../api"
import Bluebird from "bluebird"
import { getK8sIngresses } from "../status/ingress"
import { DeployActionHandler } from "../../../plugin/action-types"
import { HelmDeployAction } from "./config"
import { ActionMode, Resolved } from "../../../actions/types"

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

export const getHelmDeployStatus: DeployActionHandler<"getStatus", HelmDeployAction> = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider

  const releaseName = getReleaseName(action)

  const detail: HelmStatusDetail = {}
  let state: ServiceState
  let helmStatus: ServiceStatus

  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider,
  })

  const mode = action.mode()
  let deployedMode: ActionMode = "default"

  try {
    helmStatus = await getReleaseStatus({ ctx: k8sCtx, action, releaseName, log })
    state = helmStatus.state
    deployedMode = helmStatus.mode || "default"
  } catch (err) {
    state = "missing"
  }

  let forwardablePorts: ForwardablePort[] = []
  let ingresses: ServiceIngress[] = []

  const spec = action.getSpec()

  if (state !== "missing") {
    const deployedResources = await getRenderedResources({ ctx: k8sCtx, action, releaseName, log })

    forwardablePorts = deployedMode === "local" ? [] : getForwardablePorts(deployedResources, action)
    ingresses = getK8sIngresses(deployedResources)

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
      } else if (mode === "sync" && spec.sync?.paths) {
        // Need to start the sync here, since the deployment handler won't be called.

        // First make sure we don't fail if resources arent't actually properly configured (we don't want to throw in
        // the status handler, generally)

        const defaultNamespace = await getActionNamespace({
          ctx: k8sCtx,
          log,
          action,
          provider: k8sCtx.provider,
        })

        await startSyncs({
          ctx: k8sCtx,
          log,
          action,
          actionDefaults: spec.sync.defaults || {},
          defaultTarget: spec.defaultTarget,
          basePath: action.basePath(),
          defaultNamespace,
          manifests: deployedResources,
          syncs: spec.sync.paths,
        })
      }
    }
  }

  return {
    state: serviceStateToActionState(state),
    detail: {
      forwardablePorts,
      state,
      version: state === "ready" ? action.versionString() : undefined,
      detail,
      mode: deployedMode,
      namespaceStatuses: [namespaceStatus],
      ingresses,
    },
    // TODO-G2
    outputs: {},
  }
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
}) {
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
      values = JSON.parse(
        await helm({
          ctx,
          log,
          namespace,
          args: ["get", "values", releaseName, "--output", "json"],
          // do not send JSON output to Garden Cloud or CLI verbose log
          emitLogEvents: false,
        })
      )

      const deployedVersion = values[".garden"]?.version
      deployedMode = values[".garden"]?.mode

      if (action.mode() !== deployedMode || !deployedVersion || deployedVersion !== action.versionString()) {
        state = "outdated"
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
