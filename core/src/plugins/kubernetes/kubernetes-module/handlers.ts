/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { partition, uniq } from "lodash"

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
import { getManifests, readManifests, gardenNamespaceAnnotationValue } from "./common"
import { testKubernetesModule } from "./test"
import { runKubernetesTask } from "./run"
import { getTestResult } from "../test-results"
import { getTaskResult } from "../task-results"
import { getModuleNamespace } from "../namespace"

export const kubernetesHandlers: Partial<ModuleAndRuntimeActionHandlers<KubernetesModule>> = {
  build,
  configure: configureKubernetesModule,
  deleteService,
  deployService: deployKubernetesService,
  getPortForward: getPortForwardHandler,
  getServiceLogs,
  getServiceStatus: getKubernetesServiceStatus,
  getTaskResult,
  getTestResult,
  runTask: runKubernetesTask,
  testModule: testKubernetesModule,
}

interface KubernetesStatusDetail {
  remoteResources: KubernetesServerResource[]
}

export type KubernetesServiceStatus = ServiceStatus<KubernetesStatusDetail>

async function build({ module, log }: BuildModuleParams<KubernetesModule>): Promise<BuildResult> {
  // Get the manifests here, just to validate that the files are there and are valid YAML
  await readManifests(module, log)
  return { fresh: true }
}

export async function getKubernetesServiceStatus({
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
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  // FIXME: We're currently reading the manifests from the module source dir (instead of build dir)
  // because the build may not have been staged.
  // This means that manifests added via the `build.dependencies[].copy` field will not be included.
  const manifests = await getManifests({ api, log, module, defaultNamespace: namespace, readFromSrcDir: true })

  const { state, remoteResources } = await compareDeployedResources(k8sCtx, api, namespace, manifests, log)

  const forwardablePorts = getForwardablePorts(remoteResources)

  return {
    forwardablePorts,
    state,
    version: state === "ready" ? module.version.versionString : undefined,
    detail: { remoteResources },
  }
}

export async function deployKubernetesService(
  params: DeployServiceParams<KubernetesModule>
): Promise<KubernetesServiceStatus> {
  const { ctx, module, service, log } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)

  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })

  const manifests = await getManifests({ api, log, module, defaultNamespace: namespace })

  /**
   * We separate out manifests for namespace resources, since we don't want to apply a prune selector
   * when applying them.
   */
  const [namespaceManifests, otherManifests] = partition(manifests, (m) => m.kind === "Namespace")

  if (namespaceManifests.length > 0) {
    // Don't prune namespaces
    await apply({ log, ctx, provider: k8sCtx.provider, manifests: namespaceManifests })
    await waitForResources({
      namespace,
      ctx,
      provider: k8sCtx.provider,
      serviceName: service.name,
      resources: namespaceManifests,
      log,
    })
  }
  const pruneSelector = getSelector(service)
  if (otherManifests.length > 0) {
    // Prune everything else
    await apply({ log, ctx, provider: k8sCtx.provider, manifests: otherManifests, pruneSelector })
    await waitForResources({
      namespace,
      ctx,
      provider: k8sCtx.provider,
      serviceName: service.name,
      resources: otherManifests,
      log,
    })
  }

  await waitForResources({
    namespace,
    ctx,
    provider: k8sCtx.provider,
    serviceName: service.name,
    resources: manifests,
    log,
  })

  const status = await getKubernetesServiceStatus(params)

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
  const api = await KubeApi.factory(log, ctx, provider)
  const manifests = await getManifests({ api, log, module, defaultNamespace: namespace })

  /**
   * We separate out manifests for namespace resources, since we need to delete each of them by name.
   *
   * Unlike other resources, Garden annotates namespace resources with their name - see `getManifests` for a discussion
   * of this.
   */
  const [namespaceManifests, otherManifests] = partition(manifests, (m) => m.kind === "Namespace")

  if (namespaceManifests.length > 0) {
    await Bluebird.map(namespaceManifests, (ns) => {
      const selector = `${gardenAnnotationKey("service")}=${gardenNamespaceAnnotationValue(ns.metadata.name)}`
      return deleteObjectsBySelector({
        log,
        ctx,
        provider,
        namespace,
        selector,
        objectTypes: ["Namespace"],
        includeUninitialized: false,
      })
    })
  }
  if (otherManifests.length > 0) {
    await deleteObjectsBySelector({
      log,
      ctx,
      provider,
      namespace,
      selector: `${gardenAnnotationKey("service")}=${service.name}`,
      objectTypes: uniq(manifests.map((m) => m.kind)),
      includeUninitialized: false,
    })
  }

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
  const api = await KubeApi.factory(log, ctx, provider)
  const manifests = await getManifests({ api, log, module, defaultNamespace: namespace })

  return getAllLogs({ ...params, provider, defaultNamespace: namespace, resources: manifests })
}

function getSelector(service: KubernetesService) {
  return `${gardenAnnotationKey("service")}=${service.name}`
}
