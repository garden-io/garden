/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CacheStorage, ResultContainer, SchemaVersion } from "./results-cache-base.js"
import { CacheStorageError } from "./results-cache-base.js"
import type { Log } from "../../logger/log-entry.js"
import type { GardenErrorParams } from "../../exceptions.js"
import { RootLogger } from "../../logger/logger.js"
import type { JsonObject } from "type-fest"
import { actionReferenceToString } from "../../actions/base.js"
import type { Action } from "../../actions/types.js"
import type { RunResult } from "../../plugin/base.js"
import type { GrowCloudApi } from "../../cloud/grow/api.js"
import { GrowCloudError } from "../../cloud/grow/api.js"
import type { GetActionResultResponse } from "../../cloud/grow/trpc.js"

type GrowCloudCacheErrorParams = {
  message: string
  cause: GrowCloudError | undefined
}

class GrowCloudCacheError extends CacheStorageError {
  override readonly type = "garden-cloud-cache-storage-v2"
  override readonly cause: Error | undefined

  constructor(params: GardenErrorParams & GrowCloudCacheErrorParams) {
    super(params)
    const { cause } = params
    this.cause = cause
  }

  override describe(): string {
    return this.cause === undefined ? this.message : `${this.cause}`
  }

  static wrap(params: GrowCloudCacheErrorParams) {
    return new GrowCloudCacheError(params)
  }
}

export class GrowCloudCacheStorage implements CacheStorage<RunResult> {
  private readonly log: Log
  private readonly schemaVersion: SchemaVersion
  private readonly cloudApi: GrowCloudApi

  constructor({ cloudApi, schemaVersion }: { schemaVersion: SchemaVersion; cloudApi: GrowCloudApi }) {
    this.schemaVersion = schemaVersion
    this.cloudApi = cloudApi
    this.log = RootLogger.getInstance().createLog({ name: "garden-team-cache" })
  }

  name() {
    return "Team Cache"
  }

  public async get(cacheKey: string, action: Action): Promise<ResultContainer<JsonObject>> {
    try {
      const response: GetActionResultResponse = await this.cloudApi.getActionResult({
        schemaVersion: this.schemaVersion,
        actionRef: actionReferenceToString(action),
        actionType: action.type,
        cacheKey,
      })

      const data = response.data
      if (!data.found) {
        this.log.debug(`Got Team Cache miss for key=${cacheKey}; reason: ${data.notFoundReason}`)
        return { found: false, notFoundReason: data.notFoundDescription }
      }

      return { found: true, result: data.result as JsonObject }
    } catch (e) {
      if (!(e instanceof GrowCloudError)) {
        throw e
      }

      throw GrowCloudCacheError.wrap({
        message: `Error reading from Team Cache`,
        cause: e,
      })
    }
  }

  /**
   * Stores the value associated with the {@code key}.
   *
   * Stringifies the value and writes in to the file defined in the {@code key}.
   * Ensures the existence of the cache directory.
   *
   * Returns the value back if it was written successfully,
   * or throws a {@link LocalFileSystemCacheError} otherwise.
   */
  public async put(cacheKey: string, value: RunResult, action: Action): Promise<RunResult> {
    try {
      await this.cloudApi.createActionResult({
        schemaVersion: this.schemaVersion,
        actionRef: actionReferenceToString(action),
        actionType: action.type,
        cacheKey,
        result: value,
        startedAt: value.startedAt.toISOString(),
        completedAt: value.completedAt.toISOString(),
      })
      return value
    } catch (e) {
      if (!(e instanceof GrowCloudError)) {
        throw e
      }

      throw GrowCloudCacheError.wrap({
        message: `Error writing to Team Cache`,
        cause: e,
      })
    }
  }

  public async remove(_key: string): Promise<void> {
    // Cache invalidation is not supported in Garden Cloud
    return
  }
}
