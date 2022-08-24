/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { ServiceStatus, ForwardablePort, serviceStateToActionState } from "../../../types/service"
import { createContainerManifests, startContainerDevSync } from "./deployment"
import { KUBECTL_DEFAULT_TIMEOUT } from "../kubectl"
import { DeploymentError } from "../../../exceptions"
import { sleep } from "../../../util/util"
import { ContainerDeployAction, ContainerDeployOutputs } from "../../container/moduleConfig"
import { KubeApi } from "../api"
import { compareDeployedResources } from "../status/status"
import { getIngresses } from "./ingress"
import { getAppNamespaceStatus } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { KubernetesServerResource, KubernetesWorkload } from "../types"
import { DeployActionHandler } from "../../../plugin/action-types"
import { getDeployedImageId } from "./util"
import { Resolved } from "../../../actions/base"

interface ContainerStatusDetail {
  remoteResources: KubernetesServerResource[]
  workload: KubernetesWorkload | null
}

export type ContainerServiceStatus = ServiceStatus<ContainerStatusDetail, ContainerDeployOutputs>

export const k8sGetContainerDeployStatus: DeployActionHandler<"getStatus", ContainerDeployAction> = async (params) => {
  const { ctx, action, log, devMode, localMode } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName
  const enableDevMode = devMode && !!action.getSpec("devMode")
  const imageId = getDeployedImageId(action, provider)

  // FIXME: [objects, matched] and ingresses can be run in parallel
  const { workload, manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    action,
    imageId,
    enableDevMode,
    enableLocalMode: localMode,
    blueGreen: provider.config.deploymentStrategy === "blue-green",
  })
  const { state, remoteResources, deployedWithDevMode, deployedWithLocalMode } = await compareDeployedResources(
    k8sCtx,
    api,
    namespace,
    manifests,
    log
  )
  const ingresses = await getIngresses(action, api, provider)

  // Local mode has its own port-forwarding configuration
  const forwardablePorts: ForwardablePort[] = deployedWithLocalMode
    ? []
    : action
        .getSpec("ports")
        .filter((p) => p.protocol === "TCP")
        .map((p) => {
          return {
            name: p.name,
            protocol: "TCP",
            targetPort: p.servicePort,
            preferredLocalPort: p.localPort,
            // TODO: this needs to be configurable
            // urlProtocol: "http",
          }
        })

  const detail = {
    forwardablePorts,
    ingresses,
    state,
    namespaceStatuses: [namespaceStatus],
    version: state === "ready" ? action.versionString() : undefined,
    detail: { remoteResources, workload },
    devMode: deployedWithDevMode,
    localMode: deployedWithLocalMode,
    outputs: {
      deployedImageId: imageId,
    },
  }

  if (state === "ready" && devMode) {
    // If the service is already deployed, we still need to make sure the sync is started
    await startContainerDevSync({
      ctx: <KubernetesPluginContext>ctx,
      log,
      status: detail,
      action,
    })
  }

  return {
    state: serviceStateToActionState(state),
    detail,
    outputs: detail.outputs,
  }
}

/**
 * Resolves to true if the requested service is ready, or becomes ready within a timeout limit.
 * Throws error otherwise.
 */
export async function waitForContainerService(
  ctx: PluginContext,
  log: LogEntry,
  action: Resolved<ContainerDeployAction>,
  devMode: boolean,
  localMode: boolean,
  timeout = KUBECTL_DEFAULT_TIMEOUT
) {
  const startTime = new Date().getTime()

  while (true) {
    const status = await k8sGetContainerDeployStatus({
      ctx,
      log,
      action,
      devMode,
      localMode,
    })

    if (status.state === "ready" || status.state === "outdated") {
      return
    }

    log.silly(`Waiting for service ${action.name}`)

    if (new Date().getTime() - startTime > timeout * 1000) {
      throw new DeploymentError(
        `Timed out waiting for ${action.longDescription()} to deploy after ${timeout} seconds`,
        {
          name: action.name,
          status,
        }
      )
    }

    await sleep(1000)
  }
}
