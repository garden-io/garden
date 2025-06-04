/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerDeployAction } from "../../container/moduleConfig.js"
import { getAppNamespace } from "../namespace.js"
import { streamK8sLogs } from "../logs.js"
import type { KubernetesPluginContext } from "../config.js"
import { createWorkloadManifest } from "./deployment.js"
import { KubeApi } from "../api.js"
import type { DeployActionHandler } from "../../../plugin/action-types.js"
import { getDeployedImageId } from "./util.js"

export const k8sGetContainerDeployLogs: DeployActionHandler<"getLogs", ContainerDeployAction> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const api = await KubeApi.factory(log, ctx, provider)

  const imageId = getDeployedImageId(action)

  const resources = [
    await createWorkloadManifest({
      ctx: k8sCtx,
      api,
      provider,
      action,
      imageId,
      namespace,

      production: ctx.production,
      log,
    }),
  ]

  return streamK8sLogs({ ...params, provider, defaultNamespace: namespace, resources, actionName: action.name })
}
