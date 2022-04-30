/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash"
import { DeploymentError } from "../../../exceptions"
import { KubernetesModule } from "./moduleConfig"
import { getAppNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { execInWorkload, getTargetResource, getServiceResourceSpec } from "../util"
import { getKubernetesServiceStatus } from "./handlers"
import { ExecInServiceParams } from "../../../types/plugin/service/execInService"
import { DeployActionHandler } from "../../../plugin/action-types"
import { KubernetesDeployAction } from "./config"

export const execInKubernetesDeploy: DeployActionHandler<"exec", KubernetesDeployAction> = async (params) => {
  const { ctx, log, action, command, interactive } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const status = await getKubernetesServiceStatus({
    ...params,
    // The runtime context doesn't matter here. We're just checking if the service is running.
    runtimeContext: {
      envVars: {},
      dependencies: [],
    },
    devMode: false,
    localMode: false,
  })
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  const serviceResourceSpec = getServiceResourceSpec(action, undefined)
  const serviceResource = await getTargetResource({
    ctx,
    log,
    provider,
    action,
    manifests: status.detail.remoteResources,
    resourceSpec: serviceResourceSpec,
  })

  // TODO: this check should probably live outside of the plugin
  if (!serviceResource || !includes(["ready", "outdated"], status.state)) {
    throw new DeploymentError(`Deploy ${action.name} is not running`, {
      name: action.name,
      state: status.state,
    })
  }

  return execInWorkload({ ctx, provider, log, namespace, workload: serviceResource, command, interactive })
}
