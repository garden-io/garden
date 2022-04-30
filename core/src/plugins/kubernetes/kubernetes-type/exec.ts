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
import { DeployActionHandler } from "../../../plugin/action-types"
import { KubernetesDeployAction } from "./config"
import { getKubernetesDeployStatus } from "./handlers"

export const execInKubernetesDeploy: DeployActionHandler<"exec", KubernetesDeployAction> = async (params) => {
  const { ctx, log, action, command, interactive } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider

  // TODO-G2: We should allow for alternatives here
  const defaultTarget = action.getSpec("defaultTarget")

  if (!defaultTarget) {
    throw new ConfigurationError(
      `${action.description()} does not specify a defaultTarget. Please configure this in order to be able to use this command with.`,
      {
        name: action.name,
      }
    )
  }

  const status = await getKubernetesDeployStatus({
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

  const target = await getTargetResource({
    ctx,
    log,
    provider,
    action,
    manifests: status.detail.remoteResources,
    query: defaultTarget,
  })

  // TODO: this check should probably live outside of the plugin
  if (!target || !includes(["ready", "outdated"], status.state)) {
    throw new DeploymentError(`${action.description()} is not running`, {
      name: action.name,
      state: status.state,
    })
  }

  return execInWorkload({ ctx, provider, log, namespace, workload: target, command, interactive })
}
