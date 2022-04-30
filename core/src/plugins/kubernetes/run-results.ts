/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerRunAction } from "../container/moduleConfig"
import { KubernetesPluginContext, KubernetesProvider } from "./config"
import { KubeApi } from "./api"
import { getAppNamespace } from "./namespace"
import { deserializeValues } from "../../util/util"
import { PluginContext } from "../../plugin-context"
import { LogEntry } from "../../logger/log-entry"
import { gardenAnnotationKey } from "../../util/string"
import hasha from "hasha"
import { upsertConfigMap } from "./util"
import { trimRunOutput } from "./helm/common"
import chalk from "chalk"
import { Action, RuntimeAction } from "../../actions/base"
import { RunResult } from "../../plugin/base"
import { RunActionHandler } from "../../plugin/action-types"
import { KubernetesRunAction } from "./kubernetes-type/config"

export const k8sGetRunResult: RunActionHandler<"getResult", ContainerRunAction> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  const ns = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const resultKey = getRunResultKey(ctx, action)

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

    return { result, outputs: { log: result.log } }
  } catch (err) {
    if (err.statusCode === 404) {
      return { result: null, outputs: null }
    } else {
      throw err
    }
  }
}

export function getRunResultKey(ctx: PluginContext, action: Action) {
  const key = `${ctx.projectName}--${action.type}:${action.name}--${action.getVersionString()}`
  const hash = hasha(key, { algorithm: "sha1" })
  return `run-result--${hash.slice(0, 32)}`
}

interface StoreTaskResultParams {
  ctx: PluginContext
  log: LogEntry
  action: ContainerRunAction | KubernetesRunAction
  result: RunResult
}

/**
 * Store a task run result as a ConfigMap in the cluster.
 *
 * TODO: Implement a CRD for this.
 */
export async function storeRunResult({ ctx, log, action, result }: StoreTaskResultParams): Promise<RunResult> {
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getAppNamespace(ctx, log, provider)

  // FIXME: We should store the logs separately, because of the 1MB size limit on ConfigMaps.
  const data = trimRunOutput(result)

  try {
    await upsertConfigMap({
      api,
      namespace,
      key: getRunResultKey(ctx, action),
      labels: {
        [gardenAnnotationKey("module")]: action.getModuleName(),
        [gardenAnnotationKey("actionName")]: action.name,
        [gardenAnnotationKey("actionType")]: action.name,
        [gardenAnnotationKey("version")]: action.getVersionString(),
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
  action,
}: {
  ctx: PluginContext
  log: LogEntry
  action: RuntimeAction
}) {
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getAppNamespace(ctx, log, provider)

  const key = getRunResultKey(ctx, action)

  try {
    await api.core.deleteNamespacedConfigMap(key, namespace)
  } catch (err) {
    if (err.statusCode !== 404) {
      throw err
    }
  }
}
