/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ServiceStatus, ForwardablePort, DeployState, ServiceIngress } from "../../../types/service.js"
import { createContainerManifests } from "./deployment.js"
import type { ContainerDeployAction, ContainerDeployOutputs } from "../../container/moduleConfig.js"
import { KubeApi } from "../api.js"
import { compareDeployedResources } from "../status/status.js"
import { getIngresses } from "./ingress.js"
import { getAppNamespace } from "../namespace.js"
import type { KubernetesPluginContext } from "../config.js"
import type { KubernetesServerResource, KubernetesWorkload } from "../types.js"
import type { DeployActionHandler } from "../../../plugin/action-types.js"
import { getDeployedImageId } from "./util.js"
import type { ActionMode, Resolved } from "../../../actions/types.js"
import type { DeployStatus } from "../../../plugin/handlers/Deploy/get-status.js"
import { deployStateToActionState } from "../../../plugin/handlers/Deploy/get-status.js"

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
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const imageId = getDeployedImageId(action)

  // FIXME: [objects, matched] and ingresses can be run in parallel
  const { workload, manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    action,
    imageId,
  })
  const { state, remoteResources, deployedMode, selectorChangedResourceKeys } = await compareDeployedResources({
    ctx: k8sCtx,
    api,
    namespace,
    manifests,
    log,
  })
  const ingresses = await getIngresses(action, api, provider)

  return prepareContainerDeployStatus({
    action,
    deployedMode,
    imageId,
    remoteResources,
    workload,
    selectorChangedResourceKeys,
    state,
    ingresses,
  })
}

export function prepareContainerDeployStatus({
  action,
  deployedMode,
  imageId,
  remoteResources,
  workload,
  selectorChangedResourceKeys,
  state,
  ingresses,
}: {
  action: Resolved<ContainerDeployAction>
  deployedMode: ActionMode
  imageId: string
  remoteResources: KubernetesServerResource[]
  workload: KubernetesWorkload
  selectorChangedResourceKeys: string[]
  state: DeployState
  ingresses: ServiceIngress[] | undefined
}): DeployStatus<ContainerDeployAction> {
  const forwardablePorts: ForwardablePort[] = action
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
