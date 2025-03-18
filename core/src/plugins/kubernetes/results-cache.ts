/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {
  FILESYSTEM_CACHE_EXPIRY_DAYS,
  getLocalActionResultsCacheDir,
  SimpleLocalFileSystemCacheStorage,
} from "./results-cache-fs.js"
import type { CacheableRunAction, CacheableTestAction, KubernetesCacheEntrySchema } from "./results-cache-base.js"
import { ResultCache } from "./results-cache-base.js"
import { currentResultSchemaVersion, kubernetesCacheEntrySchema } from "./results-cache-base.js"

type RunKeyDataSchema = {
  // We include the namespace uid for run cache entries in cache key calculation, so that we re-run run actions
  // whenever the namespace has been deleted
  namespaceUid: string
}

type TestKeyData = undefined

let testResultCache: ResultCache<CacheableTestAction, KubernetesCacheEntrySchema, TestKeyData> | undefined

export async function getTestResultCache(gardenDirPath: string) {
  if (testResultCache === undefined) {
    const cacheDir = getLocalActionResultsCacheDir(gardenDirPath)
    const cacheStorage = await SimpleLocalFileSystemCacheStorage.getInstance({
      cacheDir,
      schemaVersion: currentResultSchemaVersion,
      cacheExpiryDays: FILESYSTEM_CACHE_EXPIRY_DAYS,
    })

    testResultCache = new ResultCache({ cacheStorage, resultSchema: kubernetesCacheEntrySchema })
  }
  return testResultCache
}

let runResultCache: ResultCache<CacheableRunAction, KubernetesCacheEntrySchema, RunKeyDataSchema> | undefined

export async function getRunResultCache(gardenDirPath: string) {
  if (runResultCache === undefined) {
    const cacheDir = getLocalActionResultsCacheDir(gardenDirPath)
    const cacheStorage = await SimpleLocalFileSystemCacheStorage.getInstance({
      cacheDir,
      schemaVersion: currentResultSchemaVersion,
      cacheExpiryDays: FILESYSTEM_CACHE_EXPIRY_DAYS,
    })

    runResultCache = new ResultCache({ cacheStorage, resultSchema: kubernetesCacheEntrySchema })
  }
  return runResultCache
}
