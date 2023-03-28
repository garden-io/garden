/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { ContainerDeployAction } from "../../container/moduleConfig"
import { getAppNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { startSyncs, stopSyncs } from "../sync"
import { DeployActionHandler } from "../../../plugin/action-types"
import { SyncableKind } from "../types"
import { KubernetesDeployAction } from "../kubernetes-type/config"
import { HelmDeployAction } from "../helm/config"

export const k8sContainerStartSync: DeployActionHandler<"startSync", ContainerDeployAction> = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const status = action.getStatus()

  const sync = action.getSpec("sync")
  const workload = status.detail.detail.workload

  if (!sync?.paths || !workload) {
    return {}
  }

  log.info({
    section: action.name,
    msg: chalk.grey(`Starting syncs`),
  })

  const defaultNamespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

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

  await startSyncs({
    ctx: k8sCtx,
    log,
    action,
    actionDefaults: {},
    basePath: action.basePath(),
    defaultNamespace,
    defaultTarget: target,
    manifests: status.detail.remoteResources,
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
