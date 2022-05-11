/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash"
import { DeploymentError } from "../../../exceptions"
import { getAppNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { execInWorkload, getServiceResource, getServiceResourceSpec } from "../util"
import { ExecInServiceParams } from "../../../types/plugin/service/execInService"
import { HelmModule } from "./config"
import { getServiceStatus } from "./status"
import { getBaseModule, getChartResources } from "./common"

export async function execInHelmService(params: ExecInServiceParams<HelmModule>) {
  const { ctx, log, service, command, interactive } = params
  const module = service.module
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const status = await getServiceStatus({
    ...params,
    // The runtime context doesn't matter here. We're just checking if the service is running.
    runtimeContext: {
      envVars: {},
      dependencies: [],
    },
    devMode: false,
    hotReload: false,
    localMode: false,
  })
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  const baseModule = getBaseModule(module)
  const serviceResourceSpec = getServiceResourceSpec(module, baseModule)
  const manifests = await getChartResources({
    ctx: k8sCtx,
    module,
    devMode: false,
    hotReload: false,
    log,
    version: service.version,
  })

  const serviceResource = await getServiceResource({
    ctx,
    log,
    provider,
    module,
    manifests,
    resourceSpec: serviceResourceSpec,
  })

  // TODO: this check should probably live outside of the plugin
  if (!serviceResource || !includes(["ready", "outdated"], status.state)) {
    throw new DeploymentError(`Service ${service.name} is not running`, {
      name: service.name,
      state: status.state,
    })
  }

  return execInWorkload({ ctx, provider, log, namespace, workload: serviceResource, command, interactive })
}
