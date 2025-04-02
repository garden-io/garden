/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeployActionHandler } from "../../../plugin/action-types.js"
import { KubeApi } from "../api.js"
import type { KubernetesPluginContext } from "../config.js"
import { getActionNamespace } from "../namespace.js"
import { getDeployedResources } from "../status/status.js"
import { getSyncStatus, startSyncs } from "../sync.js"
import { getManifests } from "./common.js"
import type { KubernetesDeployAction } from "./config.js"

export const kubernetesStartSync: DeployActionHandler<"startSync", KubernetesDeployAction> = async (params) => {
  const { ctx, log, action } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const spec = action.getSpec()

  if (!spec.sync?.paths?.length) {
    return {}
  }

  const api = await KubeApi.factory(log, k8sCtx, provider)

  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider,
  })

  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })
  const deployedResources = await getDeployedResources({ ctx, manifests, log })

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

export const kubernetesGetSyncStatus: DeployActionHandler<"getSyncStatus", KubernetesDeployAction> = async (params) => {
  const { ctx, log, action, monitor } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const spec = action.getSpec()

  if (!spec.sync?.paths?.length) {
    return {
      state: "not-active",
    }
  }

  const api = await KubeApi.factory(log, k8sCtx, provider)

  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider,
  })

  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })
  const deployedResources = await getDeployedResources({ ctx, manifests, log })

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
