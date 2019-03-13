/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GetServiceLogsParams } from "../../../types/plugin/params"
import { getAppNamespace } from "../namespace"
import { getKubernetesLogs } from "../logs"
import { HelmModule } from "./config"
import { KubernetesPluginContext } from "../kubernetes"

export async function getServiceLogs(params: GetServiceLogsParams<HelmModule>) {
  const { ctx, service } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const context = k8sCtx.provider.config.context
  const namespace = await getAppNamespace(k8sCtx, k8sCtx.provider)
  const selector = `app.kubernetes.io/name=${service.name}`

  return getKubernetesLogs({ ...params, context, namespace, selector })
}
