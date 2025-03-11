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
import { gardenAnnotationKey } from "../../util/string.js"
import { hashSync } from "hasha"
import { upsertConfigMap } from "./util.js"
import { trimRunOutput } from "./helm/common.js"
import type { Action } from "../../actions/types.js"
import type { RunResult } from "../../plugin/base.js"
import type { RunActionHandler } from "../../plugin/action-types.js"
import type { HelmPodRunAction } from "./helm/config.js"
import type { KubernetesRunAction } from "./kubernetes-type/config.js"
import { GardenError } from "../../exceptions.js"
import type { NamespaceStatus } from "../../types/namespace.js"
import type {
  CacheableResult,
  ClearResultParams,
  LoadResultParams,
  ResultCache,
  StoreResultParams,
} from "./results-cache.js"
import { toActionStatus } from "./results-cache.js"
import { composeCacheableResult } from "./results-cache.js"

// TODO: figure out how to get rid of the any cast here
export const k8sGetRunResult: RunActionHandler<"getResult", any> = async (params) => {
  const { action, ctx, log } = params
  const cachedResult = await runResultCache.load({ action, ctx, log })

  if (!cachedResult) {
    return { state: "not-ready", detail: null, outputs: { log: "" } }
  }

  return toActionStatus(cachedResult)
}

export type CacheableRunAction = ContainerRunAction | KubernetesRunAction | HelmPodRunAction

export type CacheableRunResult = CacheableResult & {
  /**
   * @deprecated use {@link #actionName} instead
   */
  taskName: string
}

export function composeCacheableRunResult(params: {
  result: RunResult
  action: Action
  namespaceStatus: NamespaceStatus
}): CacheableRunResult {
  const result = composeCacheableResult(params)
  return {
    ...result,
    taskName: result.actionName,
  }
}

export class RunResultCache implements ResultCache<CacheableRunAction, CacheableRunResult> {
  public async load({
    action,
    ctx,
    log,
  }: LoadResultParams<CacheableRunAction>): Promise<CacheableRunResult | undefined> {
    const k8sCtx = <KubernetesPluginContext>ctx
    const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
    const runResultNamespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
    const resultKey = this.cacheKey(ctx, action)

    try {
      const res = await api.core.readNamespacedConfigMap({ name: resultKey, namespace: runResultNamespace })
      const result = deserializeValues(res.data!)
      return result as CacheableRunResult
    } catch (err) {
      if (!(err instanceof KubernetesError)) {
        throw err
      }
      if (err.responseStatusCode === 404) {
        return undefined
      } else {
        throw err
      }
    }
  }

  public async store({
    action,
    ctx,
    log,
    result,
  }: StoreResultParams<CacheableRunAction, CacheableRunResult>): Promise<CacheableRunResult> {
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
        key: this.cacheKey(ctx, action),
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

  public async clear({ action, ctx, log }: ClearResultParams<CacheableRunAction>): Promise<void> {
    const provider = <KubernetesProvider>ctx.provider
    const api = await KubeApi.factory(log, ctx, provider)
    const namespace = await getAppNamespace(ctx as KubernetesPluginContext, log, provider)

    const key = this.cacheKey(ctx, action)

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

  cacheKey(ctx: PluginContext, action: CacheableRunAction): string {
    // change the result format version if the result format changes breaking backwards-compatibility e.g. serialization format
    const resultFormatVersion = 2
    const key = `${ctx.projectName}--${action.type}.${action.name}--${action.versionString()}--${resultFormatVersion}`
    const hash = hashSync(key, { algorithm: "sha1" })
    return `run-result--${hash.slice(0, 32)}`
  }
}

export const runResultCache = new RunResultCache()
