/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GetTaskResultParams } from "../../types/plugin/task/getTaskResult"
import { ContainerModule } from "../container/config"
import { HelmModule } from "./helm/config"
import { ModuleVersion } from "../../vcs/vcs"
import { KubernetesPluginContext, KubernetesProvider } from "./config"
import { KubeApi } from "./api"
import { getMetadataNamespace } from "./namespace"
import { RunTaskResult } from "../../types/plugin/task/runTask"
import { deserializeValues, serializeValues } from "../../util/util"
import { PluginContext } from "../../plugin-context"
import { LogEntry } from "../../logger/log-entry"

export async function getTaskResult(
  { ctx, log, task, taskVersion }: GetTaskResultParams<ContainerModule | HelmModule>,
): Promise<RunTaskResult | null> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider.config.context)
  const ns = await getMetadataNamespace(k8sCtx, log, k8sCtx.provider)
  const resultKey = getTaskResultKey(task.name, taskVersion)

  try {
    const res = await api.core.readNamespacedConfigMap(resultKey, ns)
    return <RunTaskResult>deserializeValues(res.body.data)
  } catch (err) {
    if (err.code === 404) {
      return null
    } else {
      throw err
    }
  }
}

export function getTaskResultKey(taskName: string, version: ModuleVersion) {
  return `task-result--${taskName}--${version.versionString}`
}

interface StoreTaskResultParams {
  ctx: PluginContext,
  log: LogEntry,
  taskName: string,
  taskVersion: ModuleVersion,
  result: RunTaskResult,
}

/**
 * Store a task run result as a ConfigMap in the cluster.
 *
 * TODO: Implement a CRD for this.
 */
export async function storeTaskResult(
  { ctx, log, taskName, taskVersion, result }: StoreTaskResultParams,
): Promise<RunTaskResult> {
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, provider.config.context)
  const ns = await getMetadataNamespace(ctx, log, provider)
  const resultKey = getTaskResultKey(taskName, taskVersion)

  const body = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: resultKey,
      annotations: {
        "garden.io/generated": "true",
      },
    },
    data: serializeValues(result),
  }

  try {
    await api.core.createNamespacedConfigMap(ns, <any>body)
  } catch (err) {
    if (err.code === 409) {
      await api.core.patchNamespacedConfigMap(resultKey, ns, body)
    } else {
      throw err
    }
  }

  return result
}
