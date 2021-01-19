/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { V1Deployment, V1DaemonSet, V1StatefulSet } from "@kubernetes/client-node"
import { ContainerModule } from "../../container/config"
import { RuntimeError, ConfigurationError } from "../../../exceptions"
import { gardenAnnotationKey } from "../../../util/string"
import { sortBy } from "lodash"
import { Service } from "../../../types/service"
import { LogEntry } from "../../../logger/log-entry"
import { findServiceResource } from "../util"
import { getAppNamespace, getModuleNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { HotReloadServiceParams, HotReloadServiceResult } from "../../../types/plugin/service/hotReloadService"
import { BaseResource, KubernetesResource, KubernetesWorkload } from "../types"
import { createWorkloadManifest } from "../container/deployment"
import { KubeApi } from "../api"
import { GardenModule } from "../../../types/module"
import { PluginContext } from "../../../plugin-context"
import { getBaseModule, getChartResources } from "../helm/common"
import { HelmModule } from "../helm/config"
import { getManifests } from "../kubernetes-module/common"
import { KubernetesModule } from "../kubernetes-module/config"
import { getHotReloadSpec, syncToService } from "./helpers"

export type HotReloadableResource = KubernetesResource<V1Deployment | V1DaemonSet | V1StatefulSet>
export type HotReloadableKind = "Deployment" | "DaemonSet" | "StatefulSet"

export const hotReloadableKinds: HotReloadableKind[] = ["Deployment", "DaemonSet", "StatefulSet"]

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
  service: Service
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
    baseModule = getBaseModule(<HelmModule>module)
    manifests = await getChartResources(ctx, service.module, true, log)
  } else {
    const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
    manifests = await getManifests({ api, log, module: <KubernetesModule>module, defaultNamespace: namespace })
  }

  const resourceSpec = service.spec.serviceResource
  const hotReloadSpec = getHotReloadSpec(service)

  const workload = await findServiceResource({
    ctx,
    log,
    module,
    baseModule,
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
    enableHotReload: true,
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

  const list = res.items.filter((r) => r.metadata.annotations![gardenAnnotationKey("hot-reload")] === "true")

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
