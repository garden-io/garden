/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
  CacheStorage,
  KubernetesCacheEntry,
  KubernetesCacheEntrySchema,
} from "./results-cache-base.js"
import { ResultCache } from "./results-cache-base.js"
import { currentResultSchemaVersion, kubernetesCacheEntrySchema } from "./results-cache-base.js"
import type { PluginContext } from "../../plugin-context.js"
import { GardenCloudCacheStorage } from "./results-cache-cloud-v1.js"
import { GrowCloudCacheStorage } from "./results-cache-cloud-v2.js"

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
    testResultCache = createResultCache(ctx)
  }
  return testResultCache
}

let runResultCache: ResultCache<CacheableRunAction, KubernetesCacheEntrySchema, RunKeyDataSchema> | undefined

export function getRunResultCache(ctx: PluginContext) {
  if (runResultCache === undefined) {
    runResultCache = createResultCache(ctx)
  }
  return runResultCache
}

export function createResultCache(ctx: PluginContext) {
  const cacheStorage = createCacheStorage(ctx)
  return new ResultCache({ cacheStorage, resultSchema: kubernetesCacheEntrySchema })
}

export function createCacheStorage(ctx: PluginContext): CacheStorage<KubernetesCacheEntry> {
  if (ctx.cloudApiV2) {
    return new GrowCloudCacheStorage({ schemaVersion: currentResultSchemaVersion, cloudApi: ctx.cloudApiV2 })
  }

  if (ctx.cloudApi && ctx.projectId) {
    return new GardenCloudCacheStorage({
      schemaVersion: currentResultSchemaVersion,
      cloudApi: ctx.cloudApi,
      projectId: ctx.projectId,
    })
  }

  // Fallback to local filesystem cache if not logged in to Cloud
  const cacheDir = getLocalActionResultsCacheDir(ctx.gardenDirPath)
  const fileSystemCacheStorage = new SimpleLocalFileSystemCacheStorage<KubernetesCacheEntry>({
    cacheDir,
    schemaVersion: currentResultSchemaVersion,
    cacheExpiryDays: FILESYSTEM_CACHE_EXPIRY_DAYS,
  })
  if (!isCachedCleanupInitiated) {
    // we don't need to await for completion here
    void fileSystemCacheStorage.invalidate()
    isCachedCleanupInitiated = true
  }
  return fileSystemCacheStorage
}
