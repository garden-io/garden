/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerDeployAction } from "../../container/moduleConfig.js"
import { getAppNamespace } from "../namespace.js"
import type { KubernetesPluginContext, KubernetesTargetResourceSyncModeSpec } from "../config.js"
import type { KubernetesDeployDevModeSyncSpec } from "../sync.js"
import { getSyncStatus, startSyncs, stopSyncs } from "../sync.js"
import type { DeployActionHandler } from "../../../plugin/action-types.js"
import type { KubernetesResource, SyncableKind } from "../types.js"
import type { KubernetesDeployAction } from "../kubernetes-type/config.js"
import type { HelmDeployAction } from "../helm/config.js"
import type { Executed } from "../../../actions/types.js"

export const k8sContainerStartSync: DeployActionHandler<"startSync", ContainerDeployAction> = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  const { target, syncs, deployedResources } = getSyncs(action)

  if (syncs.length === 0) {
    return {}
  }

  const defaultNamespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  await startSyncs({
    ctx: k8sCtx,
    log,
    action,
    actionDefaults: {},
    basePath: action.sourcePath(),
    defaultNamespace,
    defaultTarget: target,
    deployedResources,
    syncs,
  })

  return {}
}

// This works for kubernetes and helm Deploys as well
export const k8sContainerStopSync: DeployActionHandler<
  "stopSync",
  ContainerDeployAction | KubernetesDeployAction | HelmDeployAction
> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  await stopSyncs({
    ctx: k8sCtx,
    log,
    action,
  })

  return {}
}

export const k8sContainerGetSyncStatus: DeployActionHandler<"getSyncStatus", ContainerDeployAction> = async (
  params
) => {
  const { ctx, log, action, monitor } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  const { target, syncs, deployedResources } = getSyncs(action)

  const defaultNamespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  return getSyncStatus({
    ctx: k8sCtx,
    log,
    action,
    actionDefaults: {},
    basePath: action.sourcePath(),
    defaultNamespace,
    defaultTarget: target,
    deployedResources,
    syncs,
    monitor,
  })
}

function getSyncs(action: Executed<ContainerDeployAction>): {
  syncs: KubernetesDeployDevModeSyncSpec[]
  target?: KubernetesTargetResourceSyncModeSpec | undefined
  deployedResources: KubernetesResource[]
} {
  const status = action.getStatus()
  const sync = action.getSpec("sync")
  const workload = status.detail.detail.workload

  if (!sync?.paths || !workload) {
    return { syncs: [], deployedResources: [] }
  }

  const target = {
    kind: <SyncableKind>workload.kind,
    name: workload.metadata.name,
  }

  const syncs = sync.paths.map((s) => ({
    ...s,
    sourcePath: s.source,
    containerPath: s.target,
    target,
  }))

  return { syncs, target, deployedResources: status.detail.remoteResources }
}
