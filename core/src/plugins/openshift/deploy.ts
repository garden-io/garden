/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployActionExtension, DeployActionHandler } from "../../plugin/action-types"
import { ContainerDeployAction } from "../container/moduleConfig"
import { KubernetesProvider } from "../kubernetes/config"
import { deleteContainerDeploy, k8sContainerDeploy } from "../kubernetes/container/deployment"
import { validateDeploySpec } from "../kubernetes/container/handlers"
import { k8sGetContainerDeployStatus } from "../kubernetes/container/status"
import { k8sContainerStartSync, k8sContainerStopSync, k8sContainerGetSyncStatus } from "../kubernetes/container/sync"
import { k8sGetContainerDeployLogs } from "../kubernetes/container/logs"

export const openshiftGetContainerDeployStatus: DeployActionHandler<"getStatus", ContainerDeployAction> = async (
  params
) => {
  // TODO: separate openshift types for these if possible to pass around?
  // const openshiftCtx = <OpenShiftPluginContext>ctx
  // const provider = openshiftCtx.provider
  // const api = await KubeApi.factory(log, ctx, provider)

  return k8sGetContainerDeployStatus(params)
}

export const openshiftContainerDeployExtension = (): DeployActionExtension<ContainerDeployAction> => ({
  name: "container",
  handlers: {
    deploy: k8sContainerDeploy,
    delete: deleteContainerDeploy,
    // exec: execInContainer,
    getLogs: k8sGetContainerDeployLogs,
    // getPortForward: async (params) => {
    //   return getPortForwardHandler({ ...params, namespace: undefined })
    // },
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
