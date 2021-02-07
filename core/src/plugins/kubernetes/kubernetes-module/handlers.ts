/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { cloneDeep, partition, set, uniq } from "lodash"

import { KubernetesModule, configureKubernetesModule, KubernetesService } from "./config"
import { KubernetesPluginContext } from "../config"
import { BaseResource, KubernetesResource, KubernetesServerResource } from "../types"
import { ServiceStatus } from "../../../types/service"
import { compareDeployedResources, waitForResources } from "../status/status"
import { KubeApi } from "../api"
import { ModuleAndRuntimeActionHandlers } from "../../../types/plugin/plugin"
import { streamK8sLogs } from "../logs"
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
import { HotReloadableResource, hotReloadK8s } from "../hot-reload/hot-reload"
import { findServiceResource, getServiceResourceSpec } from "../util"
import { getHotReloadSpec, configureHotReload, getHotReloadContainerName } from "../hot-reload/helpers"
import { LogEntry } from "../../../logger/log-entry"
import { PluginContext } from "../../../plugin-context"
import { V1Deployment, V1DaemonSet, V1StatefulSet } from "@kubernetes/client-node"
import { HelmService } from "../helm/config"
import { configureDevMode, startDevModeSync } from "../dev-mode"
import chalk from "chalk"

export const kubernetesHandlers: Partial<ModuleAndRuntimeActionHandlers<KubernetesModule>> = {
  build,
  configure: configureKubernetesModule,
  deleteService,
  deployService: deployKubernetesService,
  getPortForward: getPortForwardHandler,
  getServiceLogs,
  getServiceStatus: getKubernetesServiceStatus,
  hotReloadService: hotReloadK8s,
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
  service,
  devMode,
  hotReload,
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
  const prepareResult = await prepareManifestsForSync({
    ctx,
    log,
    module,
    service,
    devMode,
    hotReload,
    manifests,
  })

  let { state, remoteResources } = await compareDeployedResources(k8sCtx, api, namespace, prepareResult.manifests, log)

  const forwardablePorts = getForwardablePorts(remoteResources)

  if (state === "ready" && devMode && service.spec.devMode) {
    // Need to start the dev-mode sync here, since the deployment handler won't be called.
    const serviceResourceSpec = getServiceResourceSpec(module, undefined)
    const target = await findServiceResource({
      ctx,
      log,
      module,
      baseModule: undefined,
      manifests: remoteResources,
      resourceSpec: serviceResourceSpec,
    })

    if (target.metadata.annotations?.[gardenAnnotationKey("dev-mode")] === "true") {
      await startDevModeSync({
        ctx,
        log: log.info({ section: service.name, symbol: "info", msg: chalk.gray(`Starting sync`) }),
        moduleRoot: service.sourceModule.path,
        namespace,
        target,
        spec: service.spec.devMode,
        containerName: service.spec.devMode.containerName,
      })
    } else {
      state = "outdated"
    }
  }

  return {
    forwardablePorts,
    state,
    version: state === "ready" ? service.version : undefined,
    detail: { remoteResources },
  }
}

export async function deployKubernetesService(
  params: DeployServiceParams<KubernetesModule>
): Promise<KubernetesServiceStatus> {
  const { ctx, module, service, log, hotReload, devMode } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)

  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })

  const manifests = await getManifests({ api, log, module, defaultNamespace: namespace })

  // We separate out manifests for namespace resources, since we don't want to apply a prune selector
  // when applying them.
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

  let target: HotReloadableResource | undefined

  const pruneSelector = getSelector(service)
  if (otherManifests.length > 0) {
    const prepareResult = await prepareManifestsForSync({
      ctx,
      log,
      module,
      service,
      devMode,
      hotReload,
      manifests,
    })

    target = prepareResult.target

    await apply({ log, ctx, provider: k8sCtx.provider, manifests: prepareResult.manifests, pruneSelector })
    await waitForResources({
      namespace,
      ctx,
      provider: k8sCtx.provider,
      serviceName: service.name,
      resources: prepareResult.manifests,
      log,
    })
  }

  const status = await getKubernetesServiceStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(service, status.forwardablePorts || [], log)

  if (devMode && service.spec.devMode && target) {
    await startDevModeSync({
      ctx,
      log: log.info({ section: service.name, symbol: "info", msg: chalk.gray(`Starting sync`) }),
      moduleRoot: service.sourceModule.path,
      namespace,
      target,
      spec: service.spec.devMode,
      containerName: service.spec.devMode.containerName,
    })
  }

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

  return streamK8sLogs({ ...params, provider, defaultNamespace: namespace, resources: manifests })
}

function getSelector(service: KubernetesService) {
  return `${gardenAnnotationKey("service")}=${service.name}`
}

/**
 * Looks for a hot-reload or dev-mode target in a list of manifests. If found, the target is either
 * configured for hot-reloading/dev-mode or annotated with `dev-mode: false` and/or `hot-reload: false`.
 *
 * Returns the manifests with the original hot reload resource replaced by the modified spec
 *
 * No-op if no target found and neither hot-reloading nor dev-mode is enabled.
 */
async function prepareManifestsForSync({
  ctx,
  log,
  module,
  service,
  devMode,
  hotReload,
  manifests,
}: {
  ctx: PluginContext
  service: KubernetesService | HelmService
  log: LogEntry
  module: KubernetesModule
  devMode: boolean
  hotReload: boolean
  manifests: KubernetesResource<BaseResource>[]
}) {
  let target: KubernetesResource<V1Deployment | V1DaemonSet | V1StatefulSet>

  try {
    target = cloneDeep(
      await findServiceResource({
        ctx,
        log,
        module,
        baseModule: undefined,
        manifests,
        resourceSpec: service.spec.serviceResource,
      })
    )
  } catch (err) {
    // This is only an error if we're actually trying to hot reload.
    if (devMode || hotReload) {
      throw err
    } else {
      // Nothing to do, so we return the original manifests
      return { manifests, target: undefined }
    }
  }

  set(target, ["metadata", "annotations", gardenAnnotationKey("dev-mode")], "false")
  set(target, ["metadata", "annotations", gardenAnnotationKey("hot-reload")], "false")

  const devModeSpec = service.spec.devMode
  const hotReloadSpec = hotReload ? getHotReloadSpec(service) : null

  if (devMode && devModeSpec) {
    configureDevMode({
      target,
      spec: devModeSpec,
      containerName: devModeSpec.containerName,
    })
  } else if (hotReload && hotReloadSpec) {
    const resourceSpec = getServiceResourceSpec(module, undefined)
    configureHotReload({
      target,
      hotReloadSpec,
      hotReloadArgs: resourceSpec.hotReloadArgs,
      containerName: getHotReloadContainerName(module),
    })
    set(target, ["metadata", "annotations", gardenAnnotationKey("hot-reload")], "true")
  }

  // Replace the original hot reload resource with the modified spec
  const preparedManifests = manifests
    .filter((m) => !(m.kind === target!.kind && target?.metadata.name === m.metadata.name))
    .concat(<KubernetesResource<BaseResource>>target)

  return { target, manifests: preparedManifests }
}
