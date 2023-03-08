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

export const k8sContainerStartSync: DeployActionHandler<"startSync", ContainerDeployAction> = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const status = action.getStatus()

  const sync = action.getSpec("sync")
  const workload = status.detail.workload

  if (!sync?.paths || !workload) {
    return {}
  }

  log.info({
    section: action.name,
    // FIXME: Not sure why we need to explicitly set the symbol here, but if we don't
    // it's not rendered.
    symbol: "info",
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

export const k8sContainerStopSync: DeployActionHandler<"stopSync", ContainerDeployAction> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const status = action.getStatus()

  const sync = action.getSpec("sync")
  const workload = status.detail.workload

  if (!sync?.paths || !workload) {
    return {}
  }

  log.info({
    section: action.name,
    // FIXME: Not sure why we need to explicitly set the symbol here, but if we don't
    // it's not rendered.
    symbol: "info",
    msg: chalk.grey(`Stopping syncs`),
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

  await stopSyncs({
    ctx: k8sCtx,
    log,
    action,
    defaultNamespace,
    defaultTarget: target,
    manifests: status.detail.remoteResources,
    syncs,
  })

  return {}
}
