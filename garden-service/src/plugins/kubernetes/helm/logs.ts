/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GetServiceLogsParams } from "../../../types/plugin/service/getServiceLogs"
import { getAppNamespace } from "../namespace"
import { getAllLogs } from "../logs"
import { HelmModule } from "./config"
import { KubernetesPluginContext } from "../config"
import { getChartResources } from "./common"

export async function getServiceLogs(params: GetServiceLogsParams<HelmModule>) {
  const { ctx, module, log } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = await getAppNamespace(k8sCtx, log, provider)

  const resources = await getChartResources(k8sCtx, module, log)

  return getAllLogs({ ...params, provider, namespace, resources })
}
