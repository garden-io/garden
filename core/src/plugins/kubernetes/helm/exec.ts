/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash"
import { ConfigurationError, DeploymentError } from "../../../exceptions"
import { getAppNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { execInWorkload, getTargetResource } from "../util"
import { getHelmDeployStatus } from "./status"
import { getChartResources } from "./common"
import { DeployActionHandler } from "../../../plugin/action-types"
import { HelmDeployAction } from "./config"

export const execInHelmDeploy: DeployActionHandler<"exec", HelmDeployAction> = async (params) => {
  const { ctx, log, action, command, interactive } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider

  // TODO-G2: We should allow for alternatives here
  const defaultTarget = action.getSpec("defaultTarget")

  if (!defaultTarget) {
    throw new ConfigurationError(`${action.longDescription()} does not specify a defaultTarget.`, {
      name: action.name,
    })
  }

  const status = await getHelmDeployStatus({
    ctx,
    action,
    log,
    devMode: false,
    localMode: false,
  })
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  const manifests = await getChartResources({
    ctx: k8sCtx,
    action,
    devMode: false,
    localMode: false,
    log,
  })

  const serviceResource = await getTargetResource({
    ctx,
    log,
    provider,
    action,
    manifests,
    query: defaultTarget,
  })

  // TODO: this check should probably live outside of the plugin
  if (!serviceResource || !includes(["ready", "outdated"], status.state)) {
    throw new DeploymentError(`${action.longDescription()} is not running`, {
      name: action.name,
      state: status.detail?.state || status.state,
    })
  }

  return execInWorkload({ ctx, provider, log, namespace, workload: serviceResource, command, interactive })
}
