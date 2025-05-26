/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash-es"
import { ConfigurationError, DeploymentError } from "../../../exceptions.js"
import { getAppNamespace } from "../namespace.js"
import type { KubernetesPluginContext } from "../config.js"
import { execInWorkload, getTargetResource } from "../util.js"
import { getHelmDeployStatus } from "./status.js"
import { getChartResources } from "./common.js"
import type { DeployActionHandler } from "../../../plugin/action-types.js"
import type { HelmDeployAction } from "./config.js"
import { styles } from "../../../logger/styles.js"

export const execInHelmDeploy: DeployActionHandler<"exec", HelmDeployAction> = async (params) => {
  const { ctx, log, action, command, interactive } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider

  // TODO: We should allow for alternatives here
  const defaultTarget = action.getSpec("defaultTarget")

  if (!defaultTarget) {
    throw new ConfigurationError({
      message: `${action.longDescription()} does not specify a defaultTarget. Please configure this in order to be able to use this command with. This is currently necessary for the ${styles.command(
        "exec"
      )} command to work with helm Deploy actions.`,
    })
  }

  const status = await getHelmDeployStatus({
    ctx,
    action,
    log,
  })
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  const manifests = await getChartResources({
    ctx: k8sCtx,
    action,
    log,
  })

  const target = await getTargetResource({
    ctx,
    log,
    provider,
    action,
    manifests,
    query: defaultTarget,
  })

  // TODO: this check should probably live outside of the plugin
  if (!target || !includes(["ready", "outdated"], status.detail?.state)) {
    throw new DeploymentError({
      message: `${action.longDescription()} is not running (Status: ${status.detail?.state || status.state})`,
    })
  }

  return execInWorkload({ ctx, provider, log, namespace, workload: target, command, interactive })
}
