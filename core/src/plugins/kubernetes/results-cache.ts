/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { getLocalActionResultsCacheDir, LocalResultCache } from "./results-cache-fs.js"
import type { CacheableRunAction, CacheableTestAction } from "./results-cache-base.js"
import { currentResultSchemaVersion, kubernetesCacheableResultSchema } from "./results-cache-base.js"

type KubernetesCacheableResultSchema = typeof kubernetesCacheableResultSchema
let resultCache: LocalResultCache<CacheableRunAction | CacheableTestAction, KubernetesCacheableResultSchema> | undefined

export function getResultCache(gardenDirPath: string) {
  if (resultCache === undefined) {
    resultCache = new LocalResultCache({
      cacheDir: getLocalActionResultsCacheDir(gardenDirPath),
      schemaVersion: currentResultSchemaVersion,
      resultSchema: kubernetesCacheableResultSchema,
    })
  }
  return resultCache
}
