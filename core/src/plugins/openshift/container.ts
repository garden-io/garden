/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { set } from "lodash"
import { Resolved } from "../../actions/types"
import { ActionLog } from "../../logger/log-entry"
import { PluginContext } from "../../plugin-context"
import { DeployActionExtension, DeployActionHandler, DeployActionParams } from "../../plugin/action-types"
import { NamespaceStatus } from "../../types/namespace"
import { gardenAnnotationKey } from "../../util/string"
import { ContainerDeployAction } from "../container/moduleConfig"
import { KubeApi } from "../kubernetes/api"
import { KubernetesPluginContext, KubernetesProvider } from "../kubernetes/config"
import { createWorkloadManifest, handleChangedSelector } from "../kubernetes/container/deployment"
import { validateDeploySpec } from "../kubernetes/container/handlers"
import { createIngressResources, getIngresses } from "../kubernetes/container/ingress"
import { createServiceResources } from "../kubernetes/container/service"
import { prepareContainerDeployStatus } from "../kubernetes/container/status"
import { getDeployedImageId } from "../kubernetes/container/util"
import { KUBECTL_DEFAULT_TIMEOUT, apply, deleteObjectsBySelector } from "../kubernetes/kubectl"
import { namespaceExists } from "../kubernetes/namespace"
import { getPortForwardHandler, killPortForwards } from "../kubernetes/port-forward"
import { compareDeployedResources, waitForResources } from "../kubernetes/status/status"
import { streamK8sLogs } from "../kubernetes/logs"

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
  const namespaceStatus = await expectNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })
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

export const openshiftContainerDeployExtension = (): DeployActionExtension<ContainerDeployAction> => ({
  name: "container",
  handlers: {
    deploy: openshiftContainerDeploy,
    delete: openshiftDeleteContainerDeploy,
    // exec: execInContainer,
    getLogs: openshiftGetContainerDeployLogs,
    getPortForward: async (params) => {
      return getPortForwardHandler({ ...params, namespace: undefined })
    },
    getStatus: openshiftGetContainerDeployStatus,

    // startSync: k8sContainerStartSync,
    // stopSync: k8sContainerStopSync,
    // getSyncStatus: k8sContainerGetSyncStatus,

    validate: async ({ ctx, action }) => {
      validateDeploySpec(action.name, <KubernetesProvider>ctx.provider, action.getSpec())
      return {}
    },
  },
})

// TODO: docstring
export const openshiftContainerDeploy: DeployActionHandler<"deploy", ContainerDeployAction> = async (params) => {
  const { ctx, action, log, force } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx, k8sCtx.provider)

  const imageId = getDeployedImageId(action, k8sCtx.provider)

  const status = await openshiftGetContainerDeployStatus(params)
  const specChangedResourceKeys: string[] = status.detail?.detail.selectorChangedResourceKeys || []
  if (specChangedResourceKeys.length > 0) {
    const namespaceStatus = await expectNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })
    await handleChangedSelector({
      action,
      specChangedResourceKeys,
      ctx: k8sCtx,
      namespace: namespaceStatus.namespaceName,
      log,
      production: ctx.production,
      force,
    })
  }

  await deployOpenShiftContainerServiceRolling({ ...params, api, imageId })

  const postDeployStatus = await openshiftGetContainerDeployStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(action, postDeployStatus.detail?.forwardablePorts || [], log)

  return postDeployStatus
}

export const openshiftDeleteContainerDeploy: DeployActionHandler<"delete", ContainerDeployAction> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = (await expectNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })).namespaceName
  const provider = k8sCtx.provider

  await deleteObjectsBySelector({
    ctx,
    log,
    provider,
    namespace,
    selector: `${gardenAnnotationKey("service")}=${action.name}`,
    objectTypes: ["deployment", "replicaset", "pod", "service", "ingress", "daemonset"],
    includeUninitialized: false,
  })

  return { state: "ready", detail: { state: "missing", detail: {} }, outputs: {} }
}

/**
 * Returns project/namespace status (which includes the namespace's name).
 * Based on the kubernetes plugin method `getNamespaceStatus`.
 * However, this method never attempts to create a missing namespace.
 * If the expected namespace does not exist, throws an error.
 *
 * TODO: improve docstring
 */
export async function expectNamespaceStatus({
  log,
  ctx,
  provider,
}: {
  log: ActionLog
  ctx: KubernetesPluginContext
  provider: KubernetesProvider
}): Promise<NamespaceStatus> {
  const namespace = provider.config.namespace!
  const api = await KubeApi.factory(log, ctx, provider)

  const exists = await namespaceExists(api, ctx, namespace.name)
  if (!exists) {
    throw new Error(
      `Namespace missing. Ask your administrator to ensure you have access to the expected namespace: ${namespace.name}`
    )
  }

  return {
    pluginName: provider.name,
    namespaceName: namespace.name,
    state: "ready",
  }
}

// NOTE: adapting from the k8s version
// TODO: deduplicate, document
export const deployOpenShiftContainerServiceRolling = async (
  params: DeployActionParams<"deploy", ContainerDeployAction> & { api: KubeApi; imageId: string }
) => {
  const { ctx, api, action, log, imageId } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  const namespaceStatus = await expectNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })
  const namespace = namespaceStatus.namespaceName

  const { manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    action,
    imageId,
  })

  const provider = k8sCtx.provider
  const pruneLabels = { [gardenAnnotationKey("service")]: action.name }

  await apply({ log, ctx, api, provider, manifests, namespace, pruneLabels })

  await waitForResources({
    namespace,
    ctx,
    provider,
    actionName: action.key(),
    resources: manifests,
    log,
    timeoutSec: action.getSpec("timeout") || KUBECTL_DEFAULT_TIMEOUT,
  })
}

// NOTE: openshift variant once again
// TODO: deduplicate, document
export async function createContainerManifests({
  ctx,
  api,
  log,
  action,
  imageId,
}: {
  ctx: PluginContext
  api: KubeApi
  log: ActionLog
  action: Resolved<ContainerDeployAction>
  imageId: string
}) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const { production } = ctx
  const namespace = (await expectNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })).namespaceName
  const ingresses = await createIngressResources(api, provider, namespace, action, log)
  const workload = await createWorkloadManifest({
    ctx: k8sCtx,
    api,
    provider,
    action,
    imageId,
    namespace,
    log,
    production,
  })
  const kubeServices = await createServiceResources(action, namespace)
  const manifests = [workload, ...kubeServices, ...ingresses]

  for (const obj of manifests) {
    set(obj, ["metadata", "labels", gardenAnnotationKey("module")], action.moduleName() || "")
    set(obj, ["metadata", "labels", gardenAnnotationKey("service")], action.name)
    set(obj, ["metadata", "annotations", gardenAnnotationKey("generated")], "true")
    set(obj, ["metadata", "annotations", gardenAnnotationKey("version")], action.versionString())
  }

  return { workload, manifests }
}

export const openshiftGetContainerDeployLogs: DeployActionHandler<"getLogs", ContainerDeployAction> = async (
  params
) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = (await expectNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })).namespaceName
  const api = await KubeApi.factory(log, ctx, provider)

  const imageId = getDeployedImageId(action, provider)

  const resources = [
    await createWorkloadManifest({
      ctx: k8sCtx,
      api,
      provider,
      action,
      imageId,
      namespace,

      production: ctx.production,
      log,
    }),
  ]

  return streamK8sLogs({ ...params, provider, defaultNamespace: namespace, resources, actionName: action.name })
}
