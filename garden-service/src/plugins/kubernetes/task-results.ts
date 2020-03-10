/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GetTaskResultParams } from "../../types/plugin/task/getTaskResult"
import { ContainerModule } from "../container/config"
import { HelmModule } from "./helm/config"
import { KubernetesModule } from "./kubernetes-module/config"
import { ModuleVersion } from "../../vcs/vcs"
import { KubernetesPluginContext, KubernetesProvider } from "./config"
import { KubeApi } from "./api"
import { getMetadataNamespace } from "./namespace"
import { RunTaskResult } from "../../types/plugin/task/runTask"
import { deserializeValues } from "../../util/util"
import { PluginContext } from "../../plugin-context"
import { LogEntry } from "../../logger/log-entry"
import { gardenAnnotationKey, tailString } from "../../util/string"
import { Module } from "../../types/module"
import hasha from "hasha"
import { upsertConfigMap } from "./util"
import { trimRunOutput } from "./helm/common"
import { MAX_RUN_RESULT_LOG_LENGTH } from "./constants"
import chalk from "chalk"

export async function getTaskResult({
  ctx,
  log,
  module,
  task,
  taskVersion,
}: GetTaskResultParams<ContainerModule | HelmModule | KubernetesModule>): Promise<RunTaskResult | null> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider)
  const ns = await getMetadataNamespace(k8sCtx, log, k8sCtx.provider)
  const resultKey = getTaskResultKey(ctx, module, task.name, taskVersion)

  try {
    const res = await api.core.readNamespacedConfigMap(resultKey, ns)
    const result: any = deserializeValues(res.data!)

    // Backwards compatibility for modified result schema
    if (!result.outputs) {
      result.outputs = {}
    }

    if (!result.outputs.log) {
      result.outputs.log = result.log || ""
    }

    if (result.version.versionString) {
      result.version = result.version.versionString
    }

    return <RunTaskResult>result
  } catch (err) {
    if (err.code === 404) {
      return null
    } else {
      throw err
    }
  }
}

export function getTaskResultKey(ctx: PluginContext, module: Module, taskName: string, version: ModuleVersion) {
  const key = `${ctx.projectName}--${module.name}--${taskName}--${version.versionString}`
  const hash = hasha(key, { algorithm: "sha1" })
  return `task-result--${hash.slice(0, 32)}`
}

interface StoreTaskResultParams {
  ctx: PluginContext
  log: LogEntry
  module: Module
  taskName: string
  taskVersion: ModuleVersion
  result: RunTaskResult
}

/**
 * Store a task run result as a ConfigMap in the cluster.
 *
 * TODO: Implement a CRD for this.
 */
export async function storeTaskResult({
  ctx,
  log,
  module,
  taskName,
  taskVersion,
  result,
}: StoreTaskResultParams): Promise<RunTaskResult> {
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, provider)
  const namespace = await getMetadataNamespace(ctx, log, provider)

  // FIXME: We should store the logs separately, because of the 1MB size limit on ConfigMaps.
  const data: RunTaskResult = trimRunOutput(result)

  if (data.outputs.log && typeof data.outputs.log === "string") {
    data.outputs.log = tailString(data.outputs.log, MAX_RUN_RESULT_LOG_LENGTH, true)
  }

  try {
    await upsertConfigMap({
      api,
      namespace,
      key: getTaskResultKey(ctx, module, taskName, taskVersion),
      labels: {
        [gardenAnnotationKey("module")]: module.name,
        [gardenAnnotationKey("task")]: taskName,
        [gardenAnnotationKey("moduleVersion")]: module.version.versionString,
        [gardenAnnotationKey("version")]: taskVersion.versionString,
      },
      data,
    })
  } catch (err) {
    log.warn(chalk.yellow(`Unable to store task result: ${err.message}`))
  }

  return data
}

/**
 * Clear the stored result for the given task. No-op if no result had been stored for it.
 */
export async function clearTaskResult({
  ctx,
  log,
  module,
  task,
  taskVersion,
}: GetTaskResultParams<ContainerModule | HelmModule | KubernetesModule>) {
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, provider)
  const namespace = await getMetadataNamespace(ctx, log, provider)

  const key = getTaskResultKey(ctx, module, task.name, taskVersion)

  try {
    await api.core.deleteNamespacedConfigMap(key, namespace)
  } catch (err) {
    if (err.code !== 404) {
      throw err
    }
  }
}
