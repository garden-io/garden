/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { Service, ServiceStatus, ForwardablePort } from "../../../types/service"
import { createContainerManifests } from "./deployment"
import { KUBECTL_DEFAULT_TIMEOUT } from "../kubectl"
import { DeploymentError } from "../../../exceptions"
import { sleep } from "../../../util/util"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { ContainerModule } from "../../container/config"
import { KubeApi } from "../api"
import { compareDeployedObjects as compareDeployedResources } from "../status/status"
import { getIngresses } from "./ingress"
import { getAppNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { RuntimeContext } from "../../../runtime-context"
import { KubernetesServerResource, KubernetesWorkload } from "../types"

interface ContainerStatusDetail {
  remoteResources: KubernetesServerResource[]
  workload: KubernetesWorkload | null
}

export type ContainerServiceStatus = ServiceStatus<ContainerStatusDetail>

export async function getContainerServiceStatus(
  { ctx, module, service, runtimeContext, log, hotReload }: GetServiceStatusParams<ContainerModule>,
): Promise<ContainerServiceStatus> {

  const k8sCtx = <KubernetesPluginContext>ctx
  // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
  const version = module.version
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, provider)
  const namespace = await getAppNamespace(k8sCtx, log, provider)

  // FIXME: [objects, matched] and ingresses can be run in parallel
  const { workload, manifests } = await createContainerManifests(k8sCtx, log, service, runtimeContext, hotReload)
  const { state, remoteResources } = await compareDeployedResources(k8sCtx, api, namespace, manifests, log, true)
  const ingresses = await getIngresses(service, api, provider)

  const forwardablePorts: ForwardablePort[] = service.spec.ports
    .filter(p => p.protocol === "TCP")
    .map(p => {
      return {
        name: p.name,
        protocol: "TCP",
        targetPort: p.servicePort,
        // TODO: this needs to be configurable
        // urlProtocol: "http",
      }
    })

  return {
    forwardablePorts,
    ingresses,
    state,
    version: state === "ready" ? version.versionString : undefined,
    detail: { remoteResources, workload },
  }
}

/**
 * Resolves to true if the requested service is ready, or becomes ready within a timeout limit.
 * Throws error otherwise.
 */
export async function waitForContainerService(
  ctx: PluginContext,
  log: LogEntry,
  runtimeContext: RuntimeContext,
  service: Service,
  hotReload: boolean,
) {
  const startTime = new Date().getTime()

  while (true) {
    const status = await getContainerServiceStatus({
      ctx, log, service, runtimeContext, module: service.module, hotReload,
    })

    if (status.state === "ready" || status.state === "outdated") {
      return
    }

    log.silly(`Waiting for service ${service.name}`)

    if (new Date().getTime() - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      throw new DeploymentError(
        `Timed out waiting for service ${service.name} to deploy`,
        { serviceName: service.name, status },
      )
    }

    await sleep(1000)
  }
}
