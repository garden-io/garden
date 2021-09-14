/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceStatus, ForwardablePort } from "../../../types/service"
import { createContainerManifests, startContainerDevSync } from "./deployment"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { ContainerModule } from "../../container/config"
import { KubeApi } from "../api"
import { compareDeployedResources } from "../status/status"
import { getIngresses } from "./ingress"
import { getAppNamespaceStatus } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { KubernetesServerResource, KubernetesWorkload } from "../types"

interface ContainerStatusDetail {
  remoteResources: KubernetesServerResource[]
  workload: KubernetesWorkload | null
}

export type ContainerServiceStatus = ServiceStatus<ContainerStatusDetail>

export async function getContainerServiceStatus({
  ctx,
  service,
  runtimeContext,
  log,
  devMode,
  devModeExcludes,
  hotReload,
}: GetServiceStatusParams<ContainerModule>): Promise<ContainerServiceStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName

  // FIXME: [objects, matched] and ingresses can be run in parallel
  const { workload, manifests } = await createContainerManifests({
    ctx: k8sCtx,
    log,
    service,
    runtimeContext,
    enableDevMode: devMode,
    enableHotReload: hotReload,
    blueGreen: provider.config.deploymentStrategy === "blue-green",
  })
  const { state, remoteResources } = await compareDeployedResources(k8sCtx, api, namespace, manifests, log)
  const ingresses = await getIngresses(service, api, provider)

  const forwardablePorts: ForwardablePort[] = service.spec.ports
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

  const status = {
    forwardablePorts,
    ingresses,
    state,
    namespaceStatuses: [namespaceStatus],
    version: state === "ready" ? service.version : undefined,
    detail: { remoteResources, workload },
  }

  if (state === "ready" && devMode) {
    // If the service is already deployed, we still need to make sure the sync is started
    await startContainerDevSync({
      ctx: <KubernetesPluginContext>ctx,
      log,
      status,
      service,
      devModeExcludes,
    })
  }

  return status
}
