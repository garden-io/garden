/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash-es"
import { DeploymentError } from "../../../exceptions.js"
import type { ContainerDeployAction } from "../../container/moduleConfig.js"
import { getAppNamespace } from "../namespace.js"
import type { KubernetesPluginContext } from "../config.js"
import { execInWorkload } from "../util.js"
import type { DeployActionHandler } from "../../../plugin/action-types.js"
import { k8sGetContainerDeployStatus } from "./status.js"

export const execInContainer: DeployActionHandler<"exec", ContainerDeployAction> = async (params) => {
  const { ctx, log, action, command, interactive, target: containerName } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const status = await k8sGetContainerDeployStatus({
    ctx,
    log,
    action,
  })
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  // TODO: this check should probably live outside of the plugin
  if (!status.detail?.detail.workload || !includes(["ready", "outdated"], status.detail?.state)) {
    throw new DeploymentError({
      message: `${action.longDescription()} is not running (Status is ${status.state})`,
    })
  }

  return execInWorkload({
    ctx,
    provider,
    log,
    namespace,
    workload: status.detail?.detail.workload,
    containerName,
    command,
    interactive,
  })
}
