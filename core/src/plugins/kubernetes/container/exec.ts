/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash"
import { DeploymentError } from "../../../exceptions"
import { ContainerDeployAction } from "../../container/moduleConfig"
import { getAppNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { execInWorkload } from "../util"
import { DeployActionHandler } from "../../../plugin/action-types"
import { k8sGetContainerDeployStatus } from "./status"

export const execInContainer: DeployActionHandler<"exec", ContainerDeployAction> = async (params) => {
  const { ctx, log, action, command, interactive } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const status = await k8sGetContainerDeployStatus({
    ctx,
    log,
    action,
    // The runtime context doesn't matter here. We're just checking if the service is running.
    runtimeContext: {
      envVars: {},
      dependencies: [],
    },
    devMode: false,
    localMode: false,
  })
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  // TODO: this check should probably live outside of the plugin
  if (!status.detail?.detail.workload || !includes(["ready", "outdated"], status.state)) {
    throw new DeploymentError(`${action.longDescription()} is not running`, {
      name: action.name,
      state: status.state,
    })
  }

  return execInWorkload({
    ctx,
    provider,
    log,
    namespace,
    workload: status.detail?.detail.workload,
    command,
    interactive,
  })
}
