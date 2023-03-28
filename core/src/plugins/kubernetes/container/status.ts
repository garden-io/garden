/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../../plugin-context"
import { Log } from "../../../logger/log-entry"
import { ServiceStatus, ForwardablePort } from "../../../types/service"
import { createContainerManifests } from "./deployment"
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
import { Resolved } from "../../../actions/types"
import { deployStateToActionState } from "../../../plugin/handlers/Deploy/get-status"

interface ContainerStatusDetail {
  remoteResources: KubernetesServerResource[]
  workload: KubernetesWorkload | null
  selectorChangedResourceKeys: string[]
}

export type ContainerServiceStatus = ServiceStatus<ContainerStatusDetail, ContainerDeployOutputs>

export const k8sGetContainerDeployStatus: DeployActionHandler<"getStatus", ContainerDeployAction> = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName
  const imageId = getDeployedImageId(action, provider)

  // FIXME: [objects, matched] and ingresses can be run in parallel
  const { workload, manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    action,
    imageId,
  })
  let {
    state,
    remoteResources,
    mode: deployedMode,
    selectorChangedResourceKeys,
  } = await compareDeployedResources(k8sCtx, api, namespace, manifests, log)
  const ingresses = await getIngresses(action, api, provider)

  // Local mode has its own port-forwarding configuration
  const forwardablePorts: ForwardablePort[] =
    deployedMode === "local"
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

  const outputs: ContainerDeployOutputs = { deployedImageId: imageId }
  const detail: ContainerServiceStatus = {
    forwardablePorts,
    ingresses,
    state,
    namespaceStatuses: [namespaceStatus],
    version: state === "ready" ? action.versionString() : undefined,
    detail: { remoteResources, workload, selectorChangedResourceKeys },
    mode: deployedMode,
    outputs,
  }

  return {
    state: deployStateToActionState(state),
    detail,
    outputs,
  }
}

/**
 * Resolves to true if the requested service is ready, or becomes ready within a timeout limit.
 * Throws error otherwise.
 */
export async function waitForContainerService(
  ctx: PluginContext,
  log: Log,
  action: Resolved<ContainerDeployAction>,
  timeout = KUBECTL_DEFAULT_TIMEOUT
) {
  const startTime = new Date().getTime()

  while (true) {
    const status = await k8sGetContainerDeployStatus({
      ctx,
      log,
      action,
    })

    const deployState = status.detail?.state

    if (deployState === "ready" || deployState === "outdated") {
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
