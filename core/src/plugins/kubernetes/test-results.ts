/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deserializeValues } from "../../util/serialization.js"
import { KubeApi, KubernetesError } from "./api.js"
import type { ContainerTestAction } from "../container/moduleConfig.js"
import type { PluginContext } from "../../plugin-context.js"
import type { KubernetesPluginContext, KubernetesProvider } from "./config.js"
import { hashSync } from "hasha"
import { gardenAnnotationKey } from "../../util/string.js"
import { upsertConfigMap } from "./util.js"
import { trimRunOutput } from "./helm/common.js"
import { getSystemNamespace } from "./namespace.js"
import type { TestActionHandler } from "../../plugin/action-types.js"
import type { HelmPodTestAction } from "./helm/config.js"
import type { KubernetesTestAction } from "./kubernetes-type/config.js"
import { GardenError } from "../../exceptions.js"
import type {
  CacheableResult,
  ClearResultParams,
  LoadResultParams,
  ResultCache,
  StoreResultParams,
} from "./results-cache.js"
import { toActionStatus } from "./results-cache.js"

// TODO: figure out how to get rid of the any cast
export const k8sGetTestResult: TestActionHandler<"getResult", any> = async (params) => {
  const { action, ctx, log } = params
  const cachedResult = await testResultCache.load({ action, ctx, log })

  if (!cachedResult) {
    return { state: "not-ready", detail: null, outputs: { log: "" } }
  }

  return toActionStatus(cachedResult)
}

export type CacheableTestAction = ContainerTestAction | KubernetesTestAction | HelmPodTestAction

export class TestResultCache implements ResultCache<CacheableTestAction, CacheableResult> {
  public async load({ action, ctx, log }: LoadResultParams<CacheableTestAction>): Promise<CacheableResult | undefined> {
    const k8sCtx = <KubernetesPluginContext>ctx
    const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
    const testResultNamespace = await getSystemNamespace(k8sCtx, k8sCtx.provider, log)
    const resultKey = this.cacheKey(k8sCtx, action)

    try {
      const res = await api.core.readNamespacedConfigMap({ name: resultKey, namespace: testResultNamespace })
      const result = deserializeValues(res.data!)
      return result as CacheableResult
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
  }: StoreResultParams<CacheableTestAction, CacheableResult>): Promise<CacheableResult> {
    const k8sCtx = ctx as KubernetesPluginContext
    const provider = ctx.provider as KubernetesProvider
    const api = await KubeApi.factory(log, k8sCtx, provider)
    const testResultNamespace = await getSystemNamespace(k8sCtx, provider, log)

    const data = trimRunOutput(result)

    try {
      await upsertConfigMap({
        api,
        namespace: testResultNamespace,
        key: this.cacheKey(k8sCtx, action),
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
      log.warn(`Unable to store test result: ${err}`)
    }

    return data
  }

  public async clear(_: ClearResultParams<CacheableTestAction>): Promise<void> {
    // not supported yet
    return
  }

  cacheKey(ctx: PluginContext, action: CacheableTestAction): string {
    // change the result format version if the result format changes breaking backwards-compatibility e.g. serialization format
    const resultFormatVersion = 3
    const key = `${ctx.projectName}--${action.name}--${action.versionString()}--${resultFormatVersion}`
    const hash = hashSync(key, { algorithm: "sha1" })
    return `test-result--${hash.slice(0, 32)}`
  }
}

export const testResultCache = new TestResultCache()
