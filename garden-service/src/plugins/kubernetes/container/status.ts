/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { RuntimeContext, Service, ServiceStatus } from "../../../types/service"
import { createContainerObjects } from "./deployment"
import { KUBECTL_DEFAULT_TIMEOUT } from "../kubectl"
import { DeploymentError } from "../../../exceptions"
import { sleep } from "../../../util/util"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { ContainerModule } from "../../container/config"
import { KubeApi } from "../api"
import { compareDeployedObjects } from "../status"
import { getIngresses } from "./ingress"
import { getAppNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"

export async function getContainerServiceStatus(
  { ctx, module, service, runtimeContext, log, hotReload }: GetServiceStatusParams<ContainerModule>,
): Promise<ServiceStatus> {

  const k8sCtx = <KubernetesPluginContext>ctx
  // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
  const version = module.version
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, provider.config.context)
  const namespace = await getAppNamespace(k8sCtx, log, provider)

  // FIXME: [objects, matched] and ingresses can be run in parallel
  const objects = await createContainerObjects(k8sCtx, log, service, runtimeContext, hotReload)
  const { state, remoteObjects } = await compareDeployedObjects(k8sCtx, api, namespace, objects, log, true)
  const ingresses = await getIngresses(service, api, provider)

  return {
    ingresses,
    state,
    version: state === "ready" ? version.versionString : undefined,
    detail: { remoteObjects },
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
