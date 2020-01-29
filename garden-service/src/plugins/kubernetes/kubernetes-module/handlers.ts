/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { uniq } from "lodash"

import { KubernetesModule, configureKubernetesModule, KubernetesService } from "./config"
import { KubernetesPluginContext } from "../config"
import { KubernetesServerResource } from "../types"
import { ServiceStatus } from "../../../types/service"
import { compareDeployedResources, waitForResources } from "../status/status"
import { KubeApi } from "../api"
import { ModuleAndRuntimeActionHandlers } from "../../../types/plugin/plugin"
import { getAllLogs } from "../logs"
import { deleteObjectsBySelector, apply } from "../kubectl"
import { BuildModuleParams, BuildResult } from "../../../types/plugin/module/build"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { DeleteServiceParams } from "../../../types/plugin/service/deleteService"
import { GetServiceLogsParams } from "../../../types/plugin/service/getServiceLogs"
import { gardenAnnotationKey } from "../../../util/string"
import { getForwardablePorts, getPortForwardHandler, killPortForwards } from "../port-forward"
import { getManifests, readManifests } from "./common"
import { testKubernetesModule } from "./test"
import { runKubernetesTask } from "./run"
import { getTestResult } from "../test-results"
import { getTaskResult } from "../task-results"
import { getModuleNamespace } from "../namespace"

export const kubernetesHandlers: Partial<ModuleAndRuntimeActionHandlers<KubernetesModule>> = {
  build,
  configure: configureKubernetesModule,
  deleteService,
  deployService,
  getPortForward: getPortForwardHandler,
  getServiceLogs,
  getServiceStatus,
  getTaskResult,
  getTestResult,
  runTask: runKubernetesTask,
  testModule: testKubernetesModule,
}

interface KubernetesStatusDetail {
  remoteResources: KubernetesServerResource[]
}

export type KubernetesServiceStatus = ServiceStatus<KubernetesStatusDetail>

async function build({ module }: BuildModuleParams<KubernetesModule>): Promise<BuildResult> {
  // Get the manifests here, just to validate that the files are there and are valid YAML
  await readManifests(module)
  return { fresh: true }
}

async function getServiceStatus({
  ctx,
  module,
  log,
}: GetServiceStatusParams<KubernetesModule>): Promise<KubernetesServiceStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
    skipCreate: true,
  })
  const api = await KubeApi.factory(log, k8sCtx.provider)
  const manifests = await getManifests(api, log, module, namespace)

  const { state, remoteResources } = await compareDeployedResources(k8sCtx, api, namespace, manifests, log)

  const forwardablePorts = getForwardablePorts(remoteResources)

  return {
    forwardablePorts,
    state,
    version: state === "ready" ? module.version.versionString : undefined,
    detail: { remoteResources },
  }
}

async function deployService(params: DeployServiceParams<KubernetesModule>): Promise<KubernetesServiceStatus> {
  const { ctx, module, service, log } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider)

  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })

  const manifests = await getManifests(api, log, module, namespace)

  const pruneSelector = getSelector(service)
  await apply({ log, provider: k8sCtx.provider, manifests, pruneSelector })

  await waitForResources({
    namespace,
    provider: k8sCtx.provider,
    serviceName: service.name,
    resources: manifests,
    log,
  })

  const status = await getServiceStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(service, status.forwardablePorts || [], log)

  return status
}

async function deleteService(params: DeleteServiceParams): Promise<KubernetesServiceStatus> {
  const { ctx, log, service, module } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, provider)
  const manifests = await getManifests(api, log, module, namespace)

  await deleteObjectsBySelector({
    log,
    provider,
    namespace,
    selector: `${gardenAnnotationKey("service")}=${service.name}`,
    objectTypes: uniq(manifests.map((m) => m.kind)),
    includeUninitialized: false,
  })

  return { state: "missing", detail: { remoteResources: [] } }
}

async function getServiceLogs(params: GetServiceLogsParams<KubernetesModule>) {
  const { ctx, log, module } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const api = await KubeApi.factory(log, provider)
  const manifests = await getManifests(api, log, module, namespace)

  return getAllLogs({ ...params, provider, defaultNamespace: namespace, resources: manifests })
}

function getSelector(service: KubernetesService) {
  return `${gardenAnnotationKey("service")}=${service.name}`
}
