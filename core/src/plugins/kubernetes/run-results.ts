/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerRunAction } from "../container/moduleConfig.js"
import type { KubernetesPluginContext, KubernetesProvider } from "./config.js"
import { KubeApi, KubernetesError } from "./api.js"
import { getAppNamespace } from "./namespace.js"
import { deserializeValues } from "../../util/serialization.js"
import type { PluginContext } from "../../plugin-context.js"
import type { Log } from "../../logger/log-entry.js"
import { gardenAnnotationKey } from "../../util/string.js"
import { hashSync } from "hasha"
import { upsertConfigMap } from "./util.js"
import { trimRunOutput } from "./helm/common.js"
import { runResultToActionState } from "../../actions/base.js"
import type { Action } from "../../actions/types.js"
import type { RunResult } from "../../plugin/base.js"
import type { RunActionHandler } from "../../plugin/action-types.js"
import type { HelmPodRunAction } from "./helm/config.js"
import type { KubernetesRunAction } from "./kubernetes-type/config.js"
import { GardenError } from "../../exceptions.js"
import type { NamespaceStatus } from "../../types/namespace.js"

// TODO: figure out how to get rid of the any cast here
export const k8sGetRunResult: RunActionHandler<"getResult", any> = async (params) => {
  const { ctx, log } = params
  const action = <ContainerRunAction>params.action
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  const runResultNamespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const resultKey = getRunResultKey(ctx, action)

  try {
    const res = await api.core.readNamespacedConfigMap({ name: resultKey, namespace: runResultNamespace })
    const result = deserializeValues(res.data!) as CacheableRunResult

    return { state: runResultToActionState(result), detail: result, outputs: { log: result.log || "" } }
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode === 404) {
      return { state: "not-ready", detail: null, outputs: {} }
    } else {
      throw err
    }
  }
}

export function getRunResultKey(ctx: PluginContext, action: Action) {
  // change the result format version if the result format changes breaking backwards-compatibility e.g. serialization format
  const resultFormatVersion = 1
  const key = `${ctx.projectName}--${action.type}.${action.name}--${action.versionString()}--${resultFormatVersion}`
  const hash = hashSync(key, { algorithm: "sha1" })
  return `run-result--${hash.slice(0, 32)}`
}

interface StoreTaskResultParams {
  ctx: PluginContext
  log: Log
  action: ContainerRunAction | KubernetesRunAction | HelmPodRunAction
  result: CacheableRunResult
}

export type CacheableRunResult = RunResult & {
  namespaceStatus: NamespaceStatus
  actionName: string
  /**
   * @deprecated use {@link #actionName} instead
   */
  taskName: string
  outputs: {
    log: string
  }
}

export function composeCacheableRunResult({
  result,
  action,
  namespaceStatus,
}: {
  result: RunResult
  action: Action
  namespaceStatus: NamespaceStatus
}): CacheableRunResult {
  return {
    ...result,
    namespaceStatus,
    actionName: action.name,
    taskName: action.name,
    outputs: {
      log: result.log || "",
    },
  }
}

/**
 * Store a task run result as a ConfigMap in the cluster.
 *
 * TODO: Implement a CRD for this.
 */
export async function storeRunResult({ ctx, log, action, result }: StoreTaskResultParams): Promise<CacheableRunResult> {
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = ctx.provider as KubernetesProvider
  const api = await KubeApi.factory(log, k8sCtx, provider)
  const runResultNamespace = await getAppNamespace(k8sCtx, log, provider)

  // FIXME: We should store the logs separately, because of the 1MB size limit on ConfigMaps.
  const data = trimRunOutput(result)

  try {
    await upsertConfigMap({
      api,
      namespace: runResultNamespace,
      key: getRunResultKey(ctx, action),
      labels: {
        [gardenAnnotationKey("action")]: action.key(),
        [gardenAnnotationKey("actionType")]: action.type,
        [gardenAnnotationKey("version")]: action.versionString(),
      },
      data,
    })
  } catch (err) {
    if (!(err instanceof GardenError)) {
      throw err
    }
    log.warn(`Unable to store run result: ${err}`)
  }

  return data
}

/**
 * Clear the stored result for the given task. No-op if no result had been stored for it.
 */
export async function clearRunResult({
  ctx,
  log,
  action,
}: {
  ctx: PluginContext
  log: Log
  action: Action
}): Promise<void> {
  const provider = <KubernetesProvider>ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getAppNamespace(ctx as KubernetesPluginContext, log, provider)

  const key = getRunResultKey(ctx, action)

  try {
    await api.core.deleteNamespacedConfigMap({ name: key, namespace })
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode !== 404) {
      throw err
    }
  }
}
