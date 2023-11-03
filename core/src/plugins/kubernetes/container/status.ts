/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceStatus, ForwardablePort, DeployState, ServiceIngress } from "../../../types/service"
import { createContainerManifests } from "./deployment"
import { ContainerDeployAction, ContainerDeployOutputs } from "../../container/moduleConfig"
import { KubeApi } from "../api"
import { compareDeployedResources } from "../status/status"
import { getIngresses } from "./ingress"
import { getNamespaceStatus } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { KubernetesServerResource, KubernetesWorkload } from "../types"
import { DeployActionHandler } from "../../../plugin/action-types"
import { getDeployedImageId } from "./util"
import { ActionMode, Resolved } from "../../../actions/types"
import { deployStateToActionState, DeployStatus } from "../../../plugin/handlers/Deploy/get-status"

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
  const namespaceStatus = await getNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })
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
