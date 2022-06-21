/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { GardenService, ServiceStatus, ForwardablePort } from "../../../types/service"
import { createContainerManifests, startContainerDevSync } from "./deployment"
import { KUBECTL_DEFAULT_TIMEOUT } from "../kubectl"
import { DeploymentError } from "../../../exceptions"
import { sleep } from "../../../util/util"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { ContainerModule } from "../../container/config"
import { KubeApi } from "../api"
import { compareDeployedResources } from "../status/status"
import { getIngresses } from "./ingress"
import { getAppNamespaceStatus } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { RuntimeContext } from "../../../runtime-context"
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
  hotReload,
  localMode,
}: GetServiceStatusParams<ContainerModule>): Promise<ContainerServiceStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName
  const enableDevMode = devMode && !!service.spec.devMode

  // FIXME: [objects, matched] and ingresses can be run in parallel
  const { workload, manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    service,
    runtimeContext,
    enableDevMode,
    enableHotReload: hotReload,
    enableLocalMode: localMode,
    blueGreen: provider.config.deploymentStrategy === "blue-green",
  })
  const {
    state,
    remoteResources,
    deployedWithDevMode,
    deployedWithHotReloading,
    deployedWithLocalMode,
  } = await compareDeployedResources(k8sCtx, api, namespace, manifests, log)
  const ingresses = await getIngresses(service, api, provider)

  // Local mode has its own port-forwarding configuration
  const forwardablePorts: ForwardablePort[] = localMode
    ? []
    : service.spec.ports
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
    devMode: deployedWithDevMode || deployedWithHotReloading,
    localMode: deployedWithLocalMode,
  }

  if (state === "ready" && devMode) {
    // If the service is already deployed, we still need to make sure the sync is started
    await startContainerDevSync({
      ctx: <KubernetesPluginContext>ctx,
      log,
      status,
      service,
    })
  }

  return status
}

/**
 * Resolves to true if the requested service is ready, or becomes ready within a timeout limit.
 * Throws error otherwise.
 */
export async function waitForContainerService(
  ctx: PluginContext,
  log: LogEntry,
  runtimeContext: RuntimeContext,
  service: GardenService,
  devMode: boolean,
  hotReload: boolean,
  localMode: boolean,
  timeout = KUBECTL_DEFAULT_TIMEOUT
) {
  const startTime = new Date().getTime()

  while (true) {
    const status = await getContainerServiceStatus({
      ctx,
      log,
      service,
      runtimeContext,
      module: service.module,
      devMode,
      hotReload,
      localMode,
    })

    if (status.state === "ready" || status.state === "outdated") {
      return
    }

    log.silly(`Waiting for service ${service.name}`)

    if (new Date().getTime() - startTime > timeout * 1000) {
      throw new DeploymentError(`Timed out waiting for service ${service.name} to deploy after ${timeout} seconds`, {
        serviceName: service.name,
        status,
      })
    }

    await sleep(1000)
  }
}
