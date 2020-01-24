/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getAppNamespace } from "../namespace"
import { waitForResources } from "../status/status"
import { helm } from "./helm-cli"
import { HelmModule } from "./config"
import {
  getChartPath,
  getReleaseName,
  getChartResources,
  findServiceResource,
  getServiceResourceSpec,
  getValueArgs,
} from "./common"
import { getReleaseStatus, HelmServiceStatus, getDeployedResources } from "./status"
import { configureHotReload, HotReloadableResource } from "../hot-reload"
import { apply, deleteResources } from "../kubectl"
import { KubernetesPluginContext } from "../config"
import { ContainerHotReloadSpec } from "../../container/config"
import { getHotReloadSpec, getHotReloadContainerName } from "./hot-reload"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { DeleteServiceParams } from "../../../types/plugin/service/deleteService"
import { getForwardablePorts, killPortForwards } from "../port-forward"

export async function deployHelmService({
  ctx,
  module,
  service,
  log,
  force,
  hotReload,
}: DeployServiceParams<HelmModule>): Promise<HelmServiceStatus> {
  let hotReloadSpec: ContainerHotReloadSpec | null = null
  let hotReloadTarget: HotReloadableResource | null = null

  const chartResources = await getChartResources(ctx, module, hotReload, log)

  if (hotReload) {
    const resourceSpec = service.spec.serviceResource
    hotReloadTarget = await findServiceResource({ ctx, log, module, chartResources, resourceSpec })
    hotReloadSpec = getHotReloadSpec(service)
  }

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider

  const chartPath = await getChartPath(module)
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const releaseName = getReleaseName(module)
  const releaseStatus = await getReleaseStatus(k8sCtx, module, releaseName, log, hotReload)

  const commonArgs = [
    "--namespace",
    namespace,
    "--timeout",
    module.spec.timeout.toString(10) + "s",
    ...(await getValueArgs(module, hotReload)),
  ]

  if (releaseStatus.state === "missing") {
    log.silly(`Installing Helm release ${releaseName}`)
    const installArgs = [
      "install",
      releaseName,
      chartPath,
      // Make sure chart gets purged if it fails to install
      "--atomic",
      ...commonArgs,
    ]
    if (force && !ctx.production) {
      installArgs.push("--replace")
    }
    await helm({ ctx: k8sCtx, namespace, log, args: [...installArgs] })
  } else {
    log.silly(`Upgrading Helm release ${releaseName}`)
    const upgradeArgs = ["upgrade", releaseName, chartPath, "--install", "--atomic", ...commonArgs]
    await helm({ ctx: k8sCtx, namespace, log, args: [...upgradeArgs] })
  }

  if (hotReload && hotReloadSpec && hotReloadTarget) {
    // Because we need to modify the Deployment, and because there is currently no reliable way to do that before
    // installing/upgrading via Helm, we need to separately update the target here.
    const resourceSpec = getServiceResourceSpec(module)

    configureHotReload({
      target: hotReloadTarget,
      hotReloadSpec,
      hotReloadArgs: resourceSpec.hotReloadArgs,
      containerName: getHotReloadContainerName(module),
    })

    await apply({ log, provider, manifests: [hotReloadTarget], namespace })
  }

  // FIXME: we should get these objects from the cluster, and not from the local `helm template` command, because
  // they may be legitimately inconsistent.
  const remoteResources = await waitForResources({
    ctx,
    provider,
    serviceName: service.name,
    resources: chartResources,
    log,
  })

  const forwardablePorts = getForwardablePorts(chartResources)

  // Make sure port forwards work after redeployment
  killPortForwards(service, forwardablePorts || [], log)

  return {
    forwardablePorts,
    state: "ready",
    version: module.version.versionString,
    detail: { remoteResources },
  }
}

export async function deleteService(params: DeleteServiceParams): Promise<HelmServiceStatus> {
  const { ctx, log, module } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const releaseName = getReleaseName(module)

  const resources = await getDeployedResources(k8sCtx, releaseName, log)

  await helm({ ctx: k8sCtx, log, args: ["uninstall", releaseName] })

  // Wait for resources to terminate
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  await deleteResources({ log, provider, resources, namespace })

  log.setSuccess("Service deleted")

  return { state: "missing", detail: { remoteResources: [] } }
}
