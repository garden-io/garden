/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { getLocalActionResultsCacheDir, LocalResultCache } from "./results-cache-fs.js"
import { MAX_RUN_RESULT_LOG_LENGTH } from "./constants.js"
import type { CacheableResult, CacheableRunAction, CacheableTestAction } from "./results-cache-base.js"
import { currentResultSchemaVersion, kubernetesCacheableResultSchema } from "./results-cache-base.js"

let resultCache: LocalResultCache<CacheableRunAction | CacheableTestAction, CacheableResult> | undefined

export function getResultCache(
  gardenDirPath: string
): LocalResultCache<CacheableRunAction | CacheableTestAction, CacheableResult> {
  if (resultCache === undefined) {
    resultCache = new LocalResultCache<CacheableRunAction | CacheableTestAction, CacheableResult>({
      cacheDir: getLocalActionResultsCacheDir(gardenDirPath),
      schemaVersion: currentResultSchemaVersion,
      maxLogLength: MAX_RUN_RESULT_LOG_LENGTH,
      resultValidator: kubernetesCacheableResultSchema.safeParse,
    })
  }
  return resultCache
}
