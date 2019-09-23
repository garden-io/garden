/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GetServiceLogsParams } from "../../../types/plugin/service/getServiceLogs"
import { ContainerModule } from "../../container/config"
import { getAppNamespace } from "../namespace"
import { getAllLogs } from "../logs"
import { KubernetesPluginContext } from "../config"
import { createWorkloadResource } from "./deployment"
import { emptyRuntimeContext } from "../../../runtime-context"

export async function getServiceLogs(params: GetServiceLogsParams<ContainerModule>) {
  const { ctx, log, service } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = await getAppNamespace(k8sCtx, log, provider)

  const resources = [await createWorkloadResource({
    provider,
    service,
    // No need for the proper context here
    runtimeContext: emptyRuntimeContext,
    namespace,
    enableHotReload: false,
    log,
  })]

  return getAllLogs({ ...params, provider, defaultNamespace: namespace, resources })
}
