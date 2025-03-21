/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CacheStorage, ResultContainer, SchemaVersion } from "./results-cache-base.js"
import { CacheStorageError } from "./results-cache-base.js"
import type { Log } from "../../logger/log-entry.js"
import type { GardenErrorParams } from "../../exceptions.js"
import { CloudApiError } from "../../exceptions.js"
import { RootLogger } from "../../logger/logger.js"
import type {
  CreateCachedActionRequest,
  GardenCloudApi,
  GetCachedActionRequest,
  GetCachedActionResponse,
} from "../../cloud/api.js"
import { actionReferenceToString } from "../../actions/base.js"
import type { Action } from "../../actions/types.js"
import type { RunResult } from "../../plugin/base.js"
import type { JsonObject } from "type-fest"

type GardenCloudCacheErrorParams = {
  message: string
  cause: CloudApiError | undefined
}

class GardenCloudCacheError extends CacheStorageError {
  override readonly type = "garden-cloud-cache-storage"
  override readonly cause: CloudApiError | undefined

  constructor(params: GardenErrorParams & GardenCloudCacheErrorParams) {
    super(params)
    const { cause } = params
    this.cause = cause
  }

  override describe(): string {
    return this.cause === undefined ? this.message : `${this.cause}`
  }

  static fromCloudApiError(params: GardenCloudCacheErrorParams) {
    return new GardenCloudCacheError(params)
  }
}

export class GardenCloudCacheStorage implements CacheStorage<RunResult> {
  private readonly log: Log
  private readonly schemaVersion: SchemaVersion
  private readonly cloudApi: GardenCloudApi
  private readonly projectId: string
  private organizationId: string | undefined

  constructor({
    cloudApi,
    schemaVersion,
    projectId,
  }: {
    schemaVersion: SchemaVersion
    cloudApi: GardenCloudApi
    projectId: string
  }) {
    this.schemaVersion = schemaVersion
    this.cloudApi = cloudApi
    this.projectId = projectId
    this.log = RootLogger.getInstance().createLog({ name: "garden-team-cache" })
  }

  name() {
    return "Team Cache"
  }

  private async getOrganizationId(): Promise<string> {
    if (this.organizationId !== undefined) {
      return this.organizationId
    }

    const cloudProject = await this.cloudApi.getProjectById(this.projectId)
    const organizationId = cloudProject.organization.id
    this.organizationId = organizationId
    return organizationId
  }

  public async get(cacheKey: string, action: Action): Promise<ResultContainer<JsonObject>> {
    try {
      const organizationId = await this.getOrganizationId()
      const request: GetCachedActionRequest = {
        schemaVersion: this.schemaVersion,
        organizationId,
        projectId: this.projectId,
        actionRef: actionReferenceToString(action),
        actionType: action.type,
        cacheKey,
      }

      const response: GetCachedActionResponse = await this.cloudApi.getActionResult(request)
      const data = response.data
      if (!data.found) {
        this.log.debug(`Got Team Cache V1 miss for key=${cacheKey}; reason: ${data.notFoundReason}`)
        return { found: false, notFoundReason: data.notFoundReason }
      }

      return { found: true, result: data.result }
    } catch (e) {
      if (!(e instanceof CloudApiError)) {
        throw e
      }

      throw GardenCloudCacheError.fromCloudApiError({
        message: "Error reading data from the Team Cache V1",
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
      const organizationId = await this.getOrganizationId()
      const request: CreateCachedActionRequest = {
        schemaVersion: this.schemaVersion,
        organizationId,
        projectId: this.projectId,
        actionRef: actionReferenceToString(action),
        actionType: action.type,
        cacheKey,
        result: value,
        startedAt: value.startedAt.toISOString(),
        completedAt: value.completedAt.toISOString(),
      }

      await this.cloudApi.createActionResult(request)
      return value
    } catch (e) {
      if (!(e instanceof CloudApiError)) {
        throw e
      }

      throw GardenCloudCacheError.fromCloudApiError({
        message: "Error storing data to the Team Cache V1",
        cause: e,
      })
    }
  }

  public async remove(_key: string): Promise<void> {
    // Cache invalidation is not supported in Garden Cloud V1
    return
  }
}
