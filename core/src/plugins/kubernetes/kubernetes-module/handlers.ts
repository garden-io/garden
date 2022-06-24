/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { cloneDeep, partition, set, uniq } from "lodash"
import { LogEntry } from "../../../logger/log-entry"
import { NamespaceStatus } from "../../../types/plugin/base"
import { ModuleAndRuntimeActionHandlers } from "../../../types/plugin/plugin"
import { DeleteServiceParams } from "../../../types/plugin/service/deleteService"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { GetServiceLogsParams } from "../../../types/plugin/service/getServiceLogs"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { ServiceStatus } from "../../../types/service"
import { gardenAnnotationKey } from "../../../util/string"
import { KubeApi } from "../api"
import { KubernetesPluginContext } from "../config"
import { configureDevMode, startDevModeSync } from "../dev-mode"
import { HelmService } from "../helm/config"
import { configureHotReload, getHotReloadContainerName, getHotReloadSpec } from "../hot-reload/helpers"
import { HotReloadableResource, hotReloadK8s } from "../hot-reload/hot-reload"
import { apply, deleteObjectsBySelector, KUBECTL_DEFAULT_TIMEOUT } from "../kubectl"
import { streamK8sLogs } from "../logs"
import { getModuleNamespace, getModuleNamespaceStatus } from "../namespace"
import { getForwardablePorts, getPortForwardHandler, killPortForwards } from "../port-forward"
import { getK8sIngresses } from "../status/ingress"
import { compareDeployedResources, isConfiguredForDevMode, waitForResources } from "../status/status"
import { getTaskResult } from "../task-results"
import { getTestResult } from "../test-results"
import { BaseResource, KubernetesResource, KubernetesServerResource } from "../types"
import { getServiceResource, getServiceResourceSpec } from "../util"
import { gardenNamespaceAnnotationValue, getManifests } from "./common"
import { configureKubernetesModule, KubernetesModule, KubernetesService } from "./config"
import { execInKubernetesService } from "./exec"
import { runKubernetesTask } from "./run"
import { testKubernetesModule } from "./test"

export const kubernetesHandlers: Partial<ModuleAndRuntimeActionHandlers<KubernetesModule>> = {
  configure: configureKubernetesModule,
  deleteService,
  execInService: execInKubernetesService,
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

export async function getKubernetesServiceStatus({
  ctx,
  module,
  log,
  service,
  devMode,
  hotReload,
  localMode,
}: GetServiceStatusParams<KubernetesModule>): Promise<KubernetesServiceStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespaceStatus = await getModuleNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
    skipCreate: true,
  })
  const namespace = namespaceStatus.namespaceName
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  // FIXME: We're currently reading the manifests from the module source dir (instead of build dir)
  // because the build may not have been staged.
  // This means that manifests added via the `build.dependencies[].copy` field will not be included.
  const manifests = await getManifests({ ctx, api, log, module, defaultNamespace: namespace, readFromSrcDir: true })
  const prepareResult = await configureSpecialModesForManifests({
    ctx: k8sCtx,
    log,
    module,
    service,
    devMode,
    hotReload,
    localMode,
    manifests,
  })

  let { state, remoteResources, deployedWithDevMode, deployedWithHotReloading } = await compareDeployedResources(
    k8sCtx,
    api,
    namespace,
    prepareResult.manifests,
    log
  )

  const forwardablePorts = getForwardablePorts(remoteResources, service)

  if (state === "ready" && devMode && service.spec.devMode) {
    // Need to start the dev-mode sync here, since the deployment handler won't be called.
    const serviceResourceSpec = getServiceResourceSpec(module, undefined)
    const target = await getServiceResource({
      ctx: k8sCtx,
      log,
      provider: k8sCtx.provider,
      module,
      manifests: remoteResources,
      resourceSpec: serviceResourceSpec,
    })

    if (isConfiguredForDevMode(target)) {
      await startDevModeSync({
        ctx,
        log,
        moduleRoot: service.sourceModule.path,
        namespace,
        target,
        spec: service.spec.devMode,
        containerName: service.spec.devMode.containerName,
        serviceName: service.name,
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
    devMode: deployedWithDevMode || deployedWithHotReloading,
    namespaceStatuses: [namespaceStatus],
    ingresses: getK8sIngresses(remoteResources),
  }
}

export async function deployKubernetesService(
  params: DeployServiceParams<KubernetesModule>
): Promise<KubernetesServiceStatus> {
  const { ctx, module, service, log, hotReload, devMode, localMode } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  const namespaceStatus = await getModuleNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider,
  })
  const namespace = namespaceStatus.namespaceName

  const manifests = await getManifests({ ctx, api, log, module, defaultNamespace: namespace })

  // We separate out manifests for namespace resources, since we don't want to apply a prune selector
  // when applying them.
  const [namespaceManifests, otherManifests] = partition(manifests, (m) => m.kind === "Namespace")

  if (namespaceManifests.length > 0) {
    // Don't prune namespaces
    await apply({ log, ctx, api, provider, manifests: namespaceManifests })
    await waitForResources({
      namespace,
      ctx,
      provider,
      serviceName: service.name,
      resources: namespaceManifests,
      log,
      timeoutSec: service.spec.timeout || KUBECTL_DEFAULT_TIMEOUT,
    })
  }

  let target: HotReloadableResource | undefined

  const pruneLabels = { [gardenAnnotationKey("service")]: service.name }
  if (otherManifests.length > 0) {
    const prepareResult = await configureSpecialModesForManifests({
      ctx: k8sCtx,
      log,
      module,
      service,
      devMode,
      hotReload,
      localMode,
      manifests,
    })

    target = prepareResult.target

    await apply({ log, ctx, api, provider: k8sCtx.provider, manifests: prepareResult.manifests, pruneLabels })
    await waitForResources({
      namespace,
      ctx,
      provider,
      serviceName: service.name,
      resources: prepareResult.manifests,
      log,
      timeoutSec: service.spec.timeout || KUBECTL_DEFAULT_TIMEOUT,
    })
  }

  const status = await getKubernetesServiceStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(service, status.forwardablePorts || [], log)

  if (target) {
    // local mode always takes precedence over dev mode
    if (localMode && service.spec.localMode) {
      // todo
      // configureLocalMode()
    } else if (devMode && service.spec.devMode) {
      await startDevModeSync({
        ctx,
        log,
        moduleRoot: service.sourceModule.path,
        namespace,
        target,
        spec: service.spec.devMode,
        containerName: service.spec.devMode.containerName,
        serviceName: service.name,
      })
    }
  }

  const namespaceStatuses = [namespaceStatus]

  if (namespaceManifests.length > 0) {
    namespaceStatuses.push(
      ...namespaceManifests.map(
        (m) =>
          ({
            pluginName: provider.name,
            namespaceName: m.metadata.name,
            state: "ready",
          } as NamespaceStatus)
      )
    )
  }

  return {
    ...status,
    namespaceStatuses,
  }
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
  const manifests = await getManifests({ ctx, api, log, module, defaultNamespace: namespace })

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

  const status: KubernetesServiceStatus = { state: "missing", detail: { remoteResources: [] } }

  if (namespaceManifests.length > 0) {
    status.namespaceStatuses = namespaceManifests.map((m) => ({
      namespaceName: m.metadata.name,
      state: "missing",
      pluginName: provider.name,
    }))
  }

  return status
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
  const manifests = await getManifests({ ctx, api, log, module, defaultNamespace: namespace })

  return streamK8sLogs({ ...params, provider, defaultNamespace: namespace, resources: manifests })
}

/**
 * Looks for a hot-reload, dev-mode or local-mode target in a list of manifests.
 * If found, the target is either configured for hot-reloading/dev-mode/local-mode
 * or annotated with `dev-mode: false`, and/or `hot-reload: false`, and/or `local-mode: false`.
 *
 * Returns the manifests with the original hot reload resource replaced by the modified spec.
 *
 * No-op if no target found and neither hot-reloading, nor dev-mode, nor local-mode is enabled.
 */
async function configureSpecialModesForManifests({
  ctx,
  log,
  module,
  service,
  devMode,
  hotReload,
  localMode,
  manifests,
}: {
  ctx: KubernetesPluginContext
  service: KubernetesService | HelmService
  log: LogEntry
  module: KubernetesModule
  devMode: boolean
  hotReload: boolean
  localMode: boolean
  manifests: KubernetesResource<BaseResource>[]
}) {
  const devModeSpec = service.spec.devMode
  const hotReloadSpec = hotReload ? getHotReloadSpec(service) : null
  const localModeSpec = service.spec.localMode

  let target: HotReloadableResource

  try {
    const resourceSpec = getServiceResourceSpec(module, undefined)

    target = cloneDeep(
      await getServiceResource({
        ctx,
        log,
        provider: ctx.provider,
        module,
        manifests,
        resourceSpec,
      })
    )
  } catch (err) {
    const enableLocalMode = localMode && localModeSpec
    const enableDevMode = devModeSpec && devMode
    // This is only an error if we're actually trying to hot reload, or start dev or local mode.
    if (enableDevMode || hotReload || enableLocalMode) {
      throw err
    } else {
      // Nothing to do, so we return the original manifests
      return { manifests, target: undefined }
    }
  }

  set(target, ["metadata", "annotations", gardenAnnotationKey("dev-mode")], "false")
  set(target, ["metadata", "annotations", gardenAnnotationKey("hot-reload")], "false")
  set(target, ["metadata", "annotations", gardenAnnotationKey("local-mode")], "false")

  // local mode always takes precedence over dev mode
  if (localMode && localModeSpec) {
    // The "local-mode" annotation is set in `configureLocalMode`.
    // todo
    // await configureLocalMode({
    //   ctx,
    //   target,
    //   spec: localModeSpec,
    //   service,
    //   log,
    //   containerName: localModeSpec.containerName,
    // })
  } else if (devMode && devModeSpec) {
    // The "dev-mode" annotation is set in `configureDevMode`.
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
