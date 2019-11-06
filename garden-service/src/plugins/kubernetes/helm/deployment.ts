/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
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
  getValueFileArgs,
} from "./common"
import { getReleaseStatus, HelmServiceStatus } from "./status"
import { configureHotReload, HotReloadableResource } from "../hot-reload"
import { apply } from "../kubectl"
import { KubernetesPluginContext } from "../config"
import { ContainerHotReloadSpec } from "../../container/config"
import { getHotReloadSpec } from "./hot-reload"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { DeleteServiceParams } from "../../../types/plugin/service/deleteService"
import { getForwardablePorts } from "../port-forward"

export async function deployService({
  ctx,
  module,
  service,
  log,
  force,
  hotReload,
}: DeployServiceParams<HelmModule>): Promise<HelmServiceStatus> {
  let hotReloadSpec: ContainerHotReloadSpec | null = null
  let hotReloadTarget: HotReloadableResource | null = null

  const chartResources = await getChartResources(ctx, module, log)

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
  const releaseStatus = await getReleaseStatus(k8sCtx, releaseName, log)

  const commonArgs = [
    "--namespace",
    namespace,
    "--timeout",
    module.spec.timeout.toString(10),
    ...(await getValueFileArgs(module)),
  ]

  if (releaseStatus.state === "missing") {
    log.silly(`Installing Helm release ${releaseName}`)
    const installArgs = [
      "install",
      chartPath,
      "--name",
      releaseName,
      // Make sure chart gets purged if it fails to install
      "--atomic",
      ...commonArgs,
    ]
    if (force) {
      installArgs.push("--replace")
    }
    await helm({ ctx: k8sCtx, namespace, log, args: [...installArgs] })
  } else {
    log.silly(`Upgrading Helm release ${releaseName}`)
    const upgradeArgs = ["upgrade", releaseName, chartPath, "--install", ...commonArgs]
    if (force) {
      upgradeArgs.push("--force")
    }
    await helm({ ctx: k8sCtx, namespace, log, args: [...upgradeArgs] })
  }

  if (hotReload && hotReloadSpec && hotReloadTarget) {
    // Because we need to modify the Deployment, and because there is currently no reliable way to do that before
    // installing/upgrading via Helm, we need to separately update the target here.
    const resourceSpec = getServiceResourceSpec(module)

    configureHotReload({
      target: hotReloadTarget,
      hotReloadSpec,
      hotReloadArgs: resourceSpec && resourceSpec.hotReloadArgs,
      containerName: resourceSpec && resourceSpec.containerName,
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
  const releaseName = getReleaseName(module)

  await helm({ ctx: k8sCtx, log, args: ["delete", "--purge", releaseName] })
  log.setSuccess("Service deleted")

  return { state: "missing", detail: { remoteResources: [] } }
}
