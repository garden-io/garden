/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
  getLocalActionResultsCacheDir,
  LocalResultCache,
  SimpleLocalFileSystemCacheStorage,
} from "./results-cache-fs.js"
import type { CacheableRunAction, CacheableTestAction, KubernetesCacheEntrySchema } from "./results-cache-base.js"
import { currentResultSchemaVersion, kubernetesCacheEntrySchema } from "./results-cache-base.js"

let resultCache: LocalResultCache<CacheableRunAction | CacheableTestAction, KubernetesCacheEntrySchema> | undefined

export function getResultCache(gardenDirPath: string) {
  if (resultCache === undefined) {
    const cacheDir = getLocalActionResultsCacheDir(gardenDirPath)
    const cacheStorage = new SimpleLocalFileSystemCacheStorage(cacheDir, currentResultSchemaVersion)

    resultCache = new LocalResultCache({ cacheStorage, resultSchema: kubernetesCacheEntrySchema })
  }
  return resultCache
}
