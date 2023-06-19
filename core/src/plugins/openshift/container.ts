/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployActionExtension, DeployActionHandler } from "../../plugin/action-types"
import { ContainerDeployAction } from "../container/moduleConfig"
import { KubeApi } from "../kubernetes/api"
import { KubernetesPluginContext, KubernetesProvider } from "../kubernetes/config"
import { createContainerManifests, deleteContainerDeploy, k8sContainerDeploy } from "../kubernetes/container/deployment"
import { execInContainer } from "../kubernetes/container/exec"
import { validateDeploySpec } from "../kubernetes/container/handlers"
import { getIngresses } from "../kubernetes/container/ingress"
import { k8sGetContainerDeployLogs } from "../kubernetes/container/logs"
import { k8sGetContainerDeployStatus, prepareContainerDeployStatus } from "../kubernetes/container/status"
import { k8sContainerStartSync, k8sContainerStopSync, k8sContainerGetSyncStatus } from "../kubernetes/container/sync"
import { getDeployedImageId } from "../kubernetes/container/util"
import { getAppNamespaceStatus } from "../kubernetes/namespace"
import { getPortForwardHandler } from "../kubernetes/port-forward"
import { compareDeployedResources } from "../kubernetes/status/status"

export const openshiftGetContainerDeployStatus: DeployActionHandler<"getStatus", ContainerDeployAction> = async (
  params
) => {
  const { ctx, action, log } = params
  // const openshiftCtx = <OpenShiftPluginContext>ctx
  // const provider = openshiftCtx.provider
  // const api = await KubeApi.factory(log, ctx, provider)

  // FIXME: temporarily copied over from Kubernetes, assuming kubernetes compatibility
  // - need to figure out where the required differences are
  // - combine and separate things as needed

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName
  const imageId = getDeployedImageId(action, provider)

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

  return prepareContainerDeployStatus({
    action,
    deployedMode,
    imageId,
    remoteResources,
    workload,
    selectorChangedResourceKeys,
    state,
    namespaceStatus,
    ingresses,
  })
}

// export const openshiftContainerDeploy: DeployActionHandler<"deploy", ContainerDeployAction> = async (params) => {}

export const openshiftContainerDeployExtension = (): DeployActionExtension<ContainerDeployAction> => ({
  name: "container",
  handlers: {
    deploy: k8sContainerDeploy,
    delete: deleteContainerDeploy,
    exec: execInContainer,
    getLogs: k8sGetContainerDeployLogs,
    getPortForward: async (params) => {
      return getPortForwardHandler({ ...params, namespace: undefined })
    },
    getStatus: k8sGetContainerDeployStatus,

    startSync: k8sContainerStartSync,
    stopSync: k8sContainerStopSync,
    getSyncStatus: k8sContainerGetSyncStatus,

    validate: async ({ ctx, action }) => {
      validateDeploySpec(action.name, <KubernetesProvider>ctx.provider, action.getSpec())
      return {}
    },
  },
})
