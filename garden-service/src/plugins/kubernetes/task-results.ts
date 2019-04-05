/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GetTaskResultParams } from "../../types/plugin/params"
import { ContainerModule } from "../container/config"
import { HelmModule } from "./helm/config"
import { ModuleVersion } from "../../vcs/vcs"
import { KubernetesPluginContext, KubernetesProvider } from "./kubernetes"
import { KubeApi } from "./api"
import { getMetadataNamespace } from "./namespace"
import { RunTaskResult } from "../../types/plugin/outputs"
import { deserializeValues, serializeValues } from "../../util/util"
import { PluginContext } from "../../plugin-context"

export async function getTaskResult(
  { ctx, task, taskVersion }: GetTaskResultParams<ContainerModule | HelmModule>,
): Promise<RunTaskResult | null> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = new KubeApi(k8sCtx.provider.config.context)
  const ns = await getMetadataNamespace(k8sCtx, k8sCtx.provider)
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

/**
 * Store a task run result as a ConfigMap in the cluster.
 *
 * TODO: Implement a CRD for this.
 */
export async function storeTaskResult(
  { ctx, taskName, taskVersion, result }:
    { ctx: PluginContext, taskName: string, taskVersion: ModuleVersion, result: RunTaskResult },
): Promise<RunTaskResult> {
  const provider = <KubernetesProvider>ctx.provider
  const api = new KubeApi(provider.config.context)
  const ns = await getMetadataNamespace(ctx, provider)
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
