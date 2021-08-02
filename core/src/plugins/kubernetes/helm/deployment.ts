/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { waitForResources } from "../status/status"
import { helm } from "./helm-cli"
import { HelmModule } from "./config"
import { getChartPath, getReleaseName, getChartResources, getValueArgs, getBaseModule } from "./common"
import { getReleaseStatus, HelmServiceStatus, getDeployedResources } from "./status"
import { HotReloadableResource } from "../hot-reload/hot-reload"
import { apply, deleteResources } from "../kubectl"
import { KubernetesPluginContext, ServiceResourceSpec } from "../config"
import { ContainerHotReloadSpec } from "../../container/config"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { DeleteServiceParams } from "../../../types/plugin/service/deleteService"
import { getForwardablePorts, killPortForwards } from "../port-forward"
import { getServiceResource, getServiceResourceSpec } from "../util"
import { getModuleNamespace, getModuleNamespaceStatus } from "../namespace"
import { getHotReloadSpec, configureHotReload, getHotReloadContainerName } from "../hot-reload/helpers"
import { configureDevMode, startDevModeSync } from "../dev-mode"
import chalk from "chalk"

export async function deployHelmService({
  ctx,
  module,
  service,
  log,
  force,
  devMode,
  hotReload,
}: DeployServiceParams<HelmModule>): Promise<HelmServiceStatus> {
  let hotReloadSpec: ContainerHotReloadSpec | null = null
  let serviceResourceSpec: ServiceResourceSpec | null = null
  let serviceResource: HotReloadableResource | null = null

  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const namespaceStatus = await getModuleNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const namespace = namespaceStatus.namespaceName

  const manifests = await getChartResources({ ctx: k8sCtx, module, devMode, hotReload, log, version: service.version })

  if ((devMode && module.spec.devMode) || hotReload) {
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

  if (hotReload) {
    hotReloadSpec = getHotReloadSpec(service)
  }

  const chartPath = await getChartPath(module)

  const releaseName = getReleaseName(module)
  const releaseStatus = await getReleaseStatus({ ctx: k8sCtx, service, releaseName, log, devMode, hotReload })

  const commonArgs = [
    "--namespace",
    namespace,
    "--timeout",
    module.spec.timeout.toString(10) + "s",
    ...(await getValueArgs(module, devMode, hotReload)),
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
    log.silly(`Upgrading Helm release ${releaseName}`)
    const upgradeArgs = ["upgrade", releaseName, chartPath, "--install", ...commonArgs]
    await helm({ ctx: k8sCtx, namespace, log, args: [...upgradeArgs] })
  }

  // Because we need to modify the Deployment, and because there is currently no reliable way to do that before
  // installing/upgrading via Helm, we need to separately update the target here for dev-mode/hot-reload.
  if (devMode && service.spec.devMode && serviceResourceSpec && serviceResource) {
    configureDevMode({
      target: serviceResource,
      spec: service.spec.devMode,
      containerName: service.spec.devMode?.containerName,
    })
    await apply({ log, ctx, provider, manifests: [serviceResource], namespace })
  } else if (hotReload && hotReloadSpec && serviceResourceSpec && serviceResource) {
    configureHotReload({
      target: serviceResource,
      hotReloadSpec,
      hotReloadArgs: serviceResourceSpec.hotReloadArgs,
      containerName: getHotReloadContainerName(module),
    })
    await apply({ log, ctx, provider, manifests: [serviceResource], namespace })
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

  const forwardablePorts = getForwardablePorts(manifests)

  // Make sure port forwards work after redeployment
  killPortForwards(service, forwardablePorts || [], log)

  if (devMode && service.spec.devMode && serviceResource && serviceResourceSpec) {
    await startDevModeSync({
      ctx,
      log: log.info({ section: service.name, symbol: "info", msg: chalk.gray(`Starting sync`) }),
      moduleRoot: service.sourceModule.path,
      namespace: serviceResource.metadata.namespace || namespace,
      target: serviceResource,
      spec: service.spec.devMode,
      containerName: service.spec.devMode.containerName,
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

  const resources = await getDeployedResources({ ctx: k8sCtx, module, releaseName, log })

  await helm({ ctx: k8sCtx, log, namespace, args: ["uninstall", releaseName] })

  // Wait for resources to terminate
  await deleteResources({ log, ctx, provider, resources, namespace })

  log.setSuccess("Service deleted")

  return { state: "missing", detail: { remoteResources: [] } }
}
