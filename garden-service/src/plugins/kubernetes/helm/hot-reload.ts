/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { HelmService, HelmModule } from "./config"
import { ConfigurationError } from "../../../exceptions"
import { deline } from "../../../util/string"
import { ContainerModule } from "../../container/config"
import { getChartResources, getBaseModule } from "./common"
import { findServiceResource, getServiceResourceSpec } from "../util"
import { syncToService } from "../hot-reload"
import { KubernetesPluginContext } from "../config"
import { HotReloadServiceParams, HotReloadServiceResult } from "../../../types/plugin/service/hotReloadService"
import { getAppNamespace } from "../namespace"

/**
 * The hot reload action handler for Helm charts.
 */
export async function hotReloadHelmChart({
  ctx,
  log,
  module,
  service,
}: HotReloadServiceParams<HelmModule, ContainerModule>): Promise<HotReloadServiceResult> {
  const hotReloadSpec = getHotReloadSpec(service)

  const manifests = await getChartResources(ctx, service.module, true, log)
  const baseModule = getBaseModule(module)
  const resourceSpec = service.spec.serviceResource

  const workload = await findServiceResource({
    ctx,
    log,
    module,
    baseModule,
    manifests,
    resourceSpec,
  })

  const k8sCtx = ctx as KubernetesPluginContext
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  await syncToService({
    ctx: k8sCtx,
    service,
    hotReloadSpec,
    workload,
    log,
    namespace,
  })

  return {}
}

export function getHotReloadSpec(service: HelmService) {
  const module = service.module
  const baseModule = getBaseModule(module)
  const resourceSpec = getServiceResourceSpec(module, baseModule)

  if (!resourceSpec || !resourceSpec.containerModule) {
    throw new ConfigurationError(
      `Module '${module.name}' must specify \`serviceResource.containerModule\` in order to enable hot-reloading.`,
      { moduleName: module.name, resourceSpec }
    )
  }

  if (service.sourceModule.type !== "container") {
    throw new ConfigurationError(
      deline`
      Module '${resourceSpec.containerModule}', referenced on module '${module.name}' under
      \`serviceResource.containerModule\`, is not a container module.
      Please specify the appropriate container module that contains the sources for the resource.`,
      { moduleName: module.name, sourceModuleType: service.sourceModule.type, resourceSpec }
    )
  }

  // The sourceModule property is assigned in the Helm module validate action
  const hotReloadSpec = service.sourceModule.spec.hotReload

  if (!hotReloadSpec) {
    throw new ConfigurationError(
      deline`
      Module '${resourceSpec.containerModule}', referenced on module '${module.name}' under
      \`serviceResource.containerModule\`, is not configured for hot-reloading.
      Please specify \`hotReload\` on the '${resourceSpec.containerModule}' module in order to enable hot-reloading.`,
      { moduleName: module.name, resourceSpec }
    )
  }

  return hotReloadSpec
}

/**
 * Used to determine which container in the target resource to attach the hot reload sync volume to.
 */
export function getHotReloadContainerName(module: HelmModule) {
  const baseModule = getBaseModule(module)
  const resourceSpec = getServiceResourceSpec(module, baseModule)
  return resourceSpec.containerName || module.name
}
