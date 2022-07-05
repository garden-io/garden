/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { waitForResources } from "../status/status"
import { helm } from "./helm-cli"
import { HelmModule } from "./config"
import {
  filterManifests,
  getBaseModule,
  getChartPath,
  getReleaseName,
  getValueArgs,
  prepareManifests,
  prepareTemplates,
} from "./common"
import {
  gardenCloudAECPauseAnnotation,
  getPausedResources,
  getReleaseStatus,
  getRenderedResources,
  HelmServiceStatus,
} from "./status"
import { SyncableResource } from "../hot-reload/hot-reload"
import { apply, deleteResources } from "../kubectl"
import { KubernetesPluginContext, ServiceResourceSpec } from "../config"
import { ContainerHotReloadSpec } from "../../container/config"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { DeleteServiceParams } from "../../../types/plugin/service/deleteService"
import { getForwardablePorts, killPortForwards } from "../port-forward"
import { getServiceResource, getServiceResourceSpec } from "../util"
import { getModuleNamespace, getModuleNamespaceStatus } from "../namespace"
import { configureHotReload, getHotReloadContainerName, getHotReloadSpec } from "../hot-reload/helpers"
import { configureDevMode, startDevModeSync } from "../dev-mode"
import { KubeApi } from "../api"
import { configureLocalMode, startServiceInLocalMode } from "../local-mode"

export async function deployHelmService({
  ctx,
  module,
  service,
  log,
  force,
  devMode,
  hotReload,
  localMode,
}: DeployServiceParams<HelmModule>): Promise<HelmServiceStatus> {
  let hotReloadSpec: ContainerHotReloadSpec | null = null
  let serviceResourceSpec: ServiceResourceSpec | null = null
  let serviceResource: SyncableResource | null = null

  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  const namespaceStatus = await getModuleNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const namespace = namespaceStatus.namespaceName

  const preparedTemplates = await prepareTemplates({
    ctx: k8sCtx,
    module,
    devMode,
    hotReload,
    localMode,
    log,
    version: service.version,
  })

  const chartPath = await getChartPath(module)
  const releaseName = getReleaseName(module)
  const releaseStatus = await getReleaseStatus({
    ctx: k8sCtx,
    module,
    service,
    releaseName,
    log,
    devMode,
    hotReload,
    localMode,
  })

  const commonArgs = [
    "--namespace",
    namespace,
    "--timeout",
    module.spec.timeout.toString(10) + "s",
    ...(await getValueArgs(module, devMode, hotReload, localMode)),
  ]

  if (module.spec.atomicInstall) {
    // Make sure chart gets purged if it fails to install
    commonArgs.push("--atomic")
  }

  if (releaseStatus.state === "missing") {
    log.silly(`Installing Helm release ${releaseName}`)
    const installArgs = ["install", releaseName, chartPath, ...commonArgs]
    if (force && !ctx.production) {
      installArgs.push("--replace")
    }
    await helm({ ctx: k8sCtx, namespace, log, args: [...installArgs] })
  } else {
    if (hotReload) {
      hotReloadSpec = getHotReloadSpec(service)
    }
    log.silly(`Upgrading Helm release ${releaseName}`)
    const upgradeArgs = ["upgrade", releaseName, chartPath, "--install", ...commonArgs]
    await helm({ ctx: k8sCtx, namespace, log, args: [...upgradeArgs] })

    // If ctx.cloudApi is defined, the user is logged in and they might be trying to deploy to an environment
    // that could have been paused by by Garden Cloud's AEC functionality. We therefore make sure to clean up any
    // dangling annotations created by Garden Cloud.
    if (ctx.cloudApi) {
      try {
        const pausedResources = await getPausedResources({ ctx: k8sCtx, module, namespace, releaseName, log })
        await Bluebird.all(
          pausedResources.map((resource) => {
            const { annotations } = resource.metadata
            if (annotations) {
              delete annotations[gardenCloudAECPauseAnnotation]
              return api.annotateResource({ log, resource, annotations })
            }
            return
          })
        )
      } catch (error) {
        const errorMsg = `Failed to remove Garden Cloud AEC annotations for service: ${service.name}.`
        log.warn(errorMsg)
        log.debug(error)
      }
    }
  }

  const preparedManifests = await prepareManifests({
    ctx: k8sCtx,
    log,
    module,
    devMode,
    hotReload,
    localMode,
    version: service.version,
    namespace: preparedTemplates.namespace,
    releaseName: preparedTemplates.releaseName,
    chartPath: preparedTemplates.chartPath,
  })
  const manifests = await filterManifests(preparedManifests)

  if ((devMode && module.spec.devMode) || hotReload || (localMode && module.spec.localMode)) {
    serviceResourceSpec = getServiceResourceSpec(module, getBaseModule(module))
    serviceResource = await getServiceResource({
      ctx,
      log,
      provider,
      module,
      manifests,
      resourceSpec: serviceResourceSpec,
    })
  }

  // Because we need to modify the Deployment, and because there is currently no reliable way to do that before
  // installing/upgrading via Helm, we need to separately update the target here for dev-mode/hot-reload/local-mode.
  // Local mode always takes precedence over dev mode.
  if (localMode && service.spec.localMode && serviceResourceSpec && serviceResource) {
    await configureLocalMode({
      ctx,
      spec: service.spec.localMode,
      targetResource: serviceResource,
      gardenService: service,
      log,
      containerName: service.spec.localMode.containerName,
    })
    await apply({ log, ctx, api, provider, manifests: [serviceResource], namespace })
  } else if (devMode && service.spec.devMode && serviceResourceSpec && serviceResource) {
    configureDevMode({
      target: serviceResource,
      spec: service.spec.devMode,
      containerName: service.spec.devMode.containerName,
    })
    await apply({ log, ctx, api, provider, manifests: [serviceResource], namespace })
  } else if (hotReload && hotReloadSpec && serviceResourceSpec && serviceResource) {
    configureHotReload({
      target: serviceResource,
      hotReloadSpec,
      hotReloadArgs: serviceResourceSpec.hotReloadArgs,
      containerName: getHotReloadContainerName(module),
    })
    await apply({ log, ctx, api, provider, manifests: [serviceResource], namespace })
  }

  // FIXME: we should get these objects from the cluster, and not from the local `helm template` command, because
  // they may be legitimately inconsistent.
  const statuses = await waitForResources({
    namespace,
    ctx,
    provider,
    serviceName: service.name,
    resources: manifests,
    log,
    timeoutSec: module.spec.timeout,
  })

  // Local mode has its own port-forwarding configuration
  const forwardablePorts = localMode && service.spec.localMode ? [] : getForwardablePorts(manifests, service)

  // Make sure port forwards work after redeployment
  killPortForwards(service, forwardablePorts || [], log)

  // Local mode always takes precedence over dev mode.
  if (localMode && service.spec.localMode && serviceResource && serviceResourceSpec) {
    await startServiceInLocalMode({
      ctx,
      spec: service.spec.localMode,
      targetResource: serviceResource,
      gardenService: service,
      namespace,
      log,
      containerName: service.spec.localMode.containerName,
    })
  } else if (devMode && service.spec.devMode && serviceResource && serviceResourceSpec) {
    await startDevModeSync({
      ctx,
      log,
      moduleRoot: service.sourceModule.path,
      namespace: serviceResource.metadata.namespace || namespace,
      target: serviceResource,
      spec: service.spec.devMode,
      containerName: service.spec.devMode.containerName,
      serviceName: service.name,
    })
  }

  return {
    forwardablePorts,
    state: "ready",
    version: service.version,
    detail: { remoteResources: statuses.map((s) => s.resource) },
    namespaceStatuses: [namespaceStatus],
  }
}

export async function deleteService(params: DeleteServiceParams): Promise<HelmServiceStatus> {
  const { ctx, log, module } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const releaseName = getReleaseName(module)

  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })

  const resources = await getRenderedResources({ ctx: k8sCtx, module, releaseName, log })

  await helm({ ctx: k8sCtx, log, namespace, args: ["uninstall", releaseName] })

  // Wait for resources to terminate
  await deleteResources({ log, ctx, provider, resources, namespace })

  log.setSuccess("Service deleted")

  return { state: "missing", detail: { remoteResources: [] } }
}
