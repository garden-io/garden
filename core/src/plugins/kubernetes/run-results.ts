/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerRunAction } from "../container/moduleConfig.js"
import type { RunActionHandler } from "../../plugin/action-types.js"
import type { HelmPodRunAction } from "./helm/config.js"
import type { KubernetesRunAction } from "./kubernetes-type/config.js"
import type { CacheableResult } from "./results-cache.js"
import { kubernetesCacheableResultSchema } from "./results-cache.js"
import { currentResultSchemaVersion } from "./results-cache.js"
import { cacheKeyProviderFactory, toActionStatus } from "./results-cache.js"
import { getLocalKubernetesRunResultsCacheDir, LocalResultCache } from "./results-cache-fs.js"
import { MAX_RUN_RESULT_LOG_LENGTH } from "./constants.js"

// TODO: figure out how to get rid of the any cast here
export const k8sGetRunResult: RunActionHandler<"getResult", any> = async (params) => {
  const { action, ctx, log } = params
  const cache = getRunResultCache(ctx.gardenDirPath)
  const cachedResult = await cache.load({ action, ctx, log })

  if (!cachedResult) {
    return { state: "not-ready", detail: null, outputs: { log: "" } }
  }

  return toActionStatus(cachedResult)
}

export type CacheableRunAction = ContainerRunAction | KubernetesRunAction | HelmPodRunAction

let runResultCache: LocalResultCache<CacheableRunAction, CacheableResult> | undefined

export function getRunResultCache(gardenDirPath: string): LocalResultCache<CacheableRunAction, CacheableResult> {
  if (runResultCache === undefined) {
    runResultCache = new LocalResultCache<CacheableRunAction, CacheableResult>({
      cacheDir: getLocalKubernetesRunResultsCacheDir(gardenDirPath),
      cacheKeyProvider: cacheKeyProviderFactory(currentResultSchemaVersion),
      maxLogLength: MAX_RUN_RESULT_LOG_LENGTH,
      resultValidator: kubernetesCacheableResultSchema.safeParse,
    })
  }
  return runResultCache
}
