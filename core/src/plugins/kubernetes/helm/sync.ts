/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeployActionHandler } from "../../../plugin/action-types.js"
import type { KubernetesPluginContext } from "../config.js"
import { getActionNamespace } from "../namespace.js"
import { getSyncStatus, startSyncs } from "../sync.js"
import { getReleaseName } from "./common.js"
import type { HelmDeployAction } from "./config.js"
import { getDeployedChartResources } from "./status.js"

export const helmStartSync: DeployActionHandler<"startSync", HelmDeployAction> = async (params) => {
  const { ctx, log, action } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const spec = action.getSpec()

  if (!spec.sync?.paths?.length) {
    return {}
  }

  const releaseName = getReleaseName(action)

  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })

  const deployedResources = await getDeployedChartResources({ ctx: k8sCtx, action, releaseName, log })

  await startSyncs({
    ctx: k8sCtx,
    log,
    action,
    actionDefaults: spec.sync.defaults || {},
    defaultTarget: spec.defaultTarget,
    basePath: action.sourcePath(),
    defaultNamespace: namespace,
    deployedResources,
    syncs: spec.sync.paths,
  })

  return {}
}

export const helmGetSyncStatus: DeployActionHandler<"getSyncStatus", HelmDeployAction> = async (params) => {
  const { ctx, log, action, monitor } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const spec = action.getSpec()

  if (!spec.sync?.paths?.length) {
    return {
      state: "not-active",
    }
  }

  const releaseName = getReleaseName(action)

  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })

  const deployedResources = await getDeployedChartResources({ ctx: k8sCtx, action, releaseName, log })

  return getSyncStatus({
    ctx: k8sCtx,
    log,
    action,
    actionDefaults: spec.sync.defaults || {},
    defaultTarget: spec.defaultTarget,
    basePath: action.sourcePath(),
    defaultNamespace: namespace,
    deployedResources,
    syncs: spec.sync.paths,
    monitor,
  })
}
