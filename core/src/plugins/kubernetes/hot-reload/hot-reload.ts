/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerModule } from "../../container/config"
import { RuntimeError, ConfigurationError } from "../../../exceptions"
import { gardenAnnotationKey } from "../../../util/string"
import { sortBy } from "lodash"
import { LogEntry } from "../../../logger/log-entry"
import { getServiceResource, getServiceResourceSpec } from "../util"
import { getAppNamespace, getModuleNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { HotReloadServiceParams, HotReloadServiceResult } from "../../../types/plugin/service/hotReloadService"
import { BaseResource, KubernetesPod, KubernetesResource, KubernetesWorkload } from "../types"
import { createWorkloadManifest } from "../container/deployment"
import { KubeApi } from "../api"
import { PluginContext } from "../../../plugin-context"
import { getBaseModule, getChartResources } from "../helm/common"
import { HelmModule, HelmService } from "../helm/config"
import { getManifests } from "../kubernetes-module/common"
import { KubernetesModule, KubernetesService } from "../kubernetes-module/config"
import { getHotReloadSpec, syncToService } from "./helpers"
import { GardenModule } from "../../../types/module"
import { isConfiguredForHotReloading } from "../status/status"

export type HotReloadableResource = KubernetesWorkload | KubernetesPod
export type HotReloadableKind = "Deployment" | "DaemonSet" | "StatefulSet"

export const hotReloadableKinds: string[] = ["Deployment", "DaemonSet", "StatefulSet"]

/**
 * The hot reload action handler for helm charts and kubernetes modules.
 */
export async function hotReloadK8s({
  ctx,
  log,
  module,
  service,
}: {
  ctx: PluginContext
  service: KubernetesService | HelmService
  log: LogEntry
  module: KubernetesModule | HelmModule
}): Promise<HotReloadServiceResult> {
  const k8sCtx = ctx as KubernetesPluginContext
  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })

  let manifests: KubernetesResource<BaseResource>[]
  let baseModule: GardenModule | undefined = undefined

  if (module.type === "helm") {
    manifests = await getChartResources({
      ctx: k8sCtx,
      module: service.module,
      devMode: false,
      hotReload: true,
      log,
      version: service.version,
    })
    baseModule = getBaseModule(<HelmModule>module)
  } else {
    const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
    manifests = await getManifests({ ctx, api, log, module: <KubernetesModule>module, defaultNamespace: namespace })
  }

  const resourceSpec = getServiceResourceSpec(module, baseModule)
  const hotReloadSpec = getHotReloadSpec(service)

  const workload = await getServiceResource({
    ctx,
    log,
    provider: k8sCtx.provider,
    module,
    manifests,
    resourceSpec,
  })

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

/**
 * The hot reload action handler for containers.
 */
export async function hotReloadContainer({
  ctx,
  log,
  service,
  module,
}: HotReloadServiceParams<ContainerModule>): Promise<HotReloadServiceResult> {
  const hotReloadSpec = module.spec.hotReload

  if (!hotReloadSpec) {
    throw new ConfigurationError(
      `Module ${module.name} must specify the \`hotReload\` key for service ${service.name} to be hot-reloadable.`,
      { moduleName: module.name, serviceName: service.name }
    )
  }

  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const api = await KubeApi.factory(log, ctx, provider)

  // Find the currently deployed workload by labels
  const manifest = await createWorkloadManifest({
    api,
    provider,
    service,
    runtimeContext: { envVars: {}, dependencies: [] },
    namespace,
    enableDevMode: false,
    enableHotReload: true,
    enableLocalMode: false,
    production: k8sCtx.production,
    log,
    blueGreen: provider.config.deploymentStrategy === "blue-green",
  })

  const res = await api.listResources<KubernetesWorkload>({
    log,
    apiVersion: manifest.apiVersion,
    kind: manifest.kind,
    namespace,
    labelSelector: {
      [gardenAnnotationKey("service")]: service.name,
    },
  })

  const list = res.items.filter((r) => isConfiguredForHotReloading(r))

  if (list.length === 0) {
    throw new RuntimeError(`Unable to find deployed instance of service ${service.name} with hot-reloading enabled`, {
      service,
      listResult: res,
    })
  }

  const workload = sortBy(list, (r) => r.metadata.creationTimestamp)[list.length - 1]

  await syncToService({
    log,
    ctx: k8sCtx,
    service,
    workload,
    hotReloadSpec,
    namespace,
  })

  return {}
}
