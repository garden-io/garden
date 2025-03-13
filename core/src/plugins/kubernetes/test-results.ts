/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerTestAction } from "../container/moduleConfig.js"
import type { TestActionHandler } from "../../plugin/action-types.js"
import type { HelmPodTestAction } from "./helm/config.js"
import type { KubernetesTestAction } from "./kubernetes-type/config.js"
import type { CacheableResult } from "./results-cache.js"
import { trimRunOutput } from "./results-cache.js"
import { kubernetesCacheableResultSchema } from "./results-cache.js"
import { cacheKeyProviderFactory, currentResultSchemaVersion } from "./results-cache.js"
import { toActionStatus } from "./results-cache.js"
import { LocalResultCache } from "./results-cache-fs.js"

// TODO: figure out how to get rid of the any cast
export const k8sGetTestResult: TestActionHandler<"getResult", any> = async (params) => {
  const { action, ctx, log } = params
  const cache = getTestResultCache(ctx.gardenDirPath)
  const cachedResult = await cache.load({ action, ctx, log })

  if (!cachedResult) {
    return { state: "not-ready", detail: null, outputs: { log: "" } }
  }

  return toActionStatus(cachedResult)
}

export type CacheableTestAction = ContainerTestAction | KubernetesTestAction | HelmPodTestAction

let testResultCache: LocalResultCache<CacheableTestAction, CacheableResult> | undefined

export function getTestResultCache(gardenDirPath: string): LocalResultCache<CacheableTestAction, CacheableResult> {
  if (testResultCache === undefined) {
    testResultCache = new LocalResultCache<CacheableTestAction, CacheableResult>({
      cacheKeyProvider: cacheKeyProviderFactory(currentResultSchemaVersion),
      resultValidator: kubernetesCacheableResultSchema.safeParse,
      resultTrimmer: trimRunOutput,
      gardenDirPath,
    })
  }
  return testResultCache
}
