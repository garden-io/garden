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
import type {
  CacheableRunAction,
  CacheableTestAction,
  KubernetesCacheEntry,
  KubernetesCacheEntrySchema,
} from "./results-cache-base.js"
import { ResultCache } from "./results-cache-base.js"
import { currentResultSchemaVersion, kubernetesCacheEntrySchema } from "./results-cache-base.js"
import type { PluginContext } from "../../plugin-context.js"

type RunKeyDataSchema = {
  // We include the namespace uid for run cache entries in cache key calculation, so that we re-run run actions
  // whenever the namespace has been deleted
  namespaceUid: string
}

type TestKeyData = undefined

let testResultCache: ResultCache<CacheableTestAction, KubernetesCacheEntrySchema, TestKeyData> | undefined
let isCachedCleanupInitiated: boolean = false

// TODO: consider storing the cache instance in the plugin context
export function getTestResultCache(ctx: PluginContext) {
  if (testResultCache === undefined) {
    const cacheDir = getLocalActionResultsCacheDir(ctx.gardenDirPath)
    const cacheStorage = new SimpleLocalFileSystemCacheStorage<KubernetesCacheEntry>({
      cacheDir,
      schemaVersion: currentResultSchemaVersion,
      cacheExpiryDays: FILESYSTEM_CACHE_EXPIRY_DAYS,
    })
    if (!isCachedCleanupInitiated) {
      // we don't need to await for completion here
      void cacheStorage.invalidate()
      isCachedCleanupInitiated = true
    }

    testResultCache = new ResultCache({ cacheStorage, resultSchema: kubernetesCacheEntrySchema })
  }
  return testResultCache
}

let runResultCache: ResultCache<CacheableRunAction, KubernetesCacheEntrySchema, RunKeyDataSchema> | undefined

// TODO: deduplicate this with the getter above
export function getRunResultCache(ctx: PluginContext) {
  if (runResultCache === undefined) {
    const cacheDir = getLocalActionResultsCacheDir(ctx.gardenDirPath)
    const cacheStorage = new SimpleLocalFileSystemCacheStorage<KubernetesCacheEntry>({
      cacheDir,
      schemaVersion: currentResultSchemaVersion,
      cacheExpiryDays: FILESYSTEM_CACHE_EXPIRY_DAYS,
    })
    if (!isCachedCleanupInitiated) {
      // we don't need to await for completion here
      void cacheStorage.invalidate()
      isCachedCleanupInitiated = true
    }

    runResultCache = new ResultCache({ cacheStorage, resultSchema: kubernetesCacheEntrySchema })
  }
  return runResultCache
}
