/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
  CacheableAction,
  CacheableResult,
  ClearResultParams,
  LoadResultParams,
  ResultValidator,
  SchemaVersion,
  StoreResultParams,
} from "./results-cache-base.js"
import { AbstractResultCache } from "./results-cache-base.js"
import type { Log } from "../../logger/log-entry.js"
import { deline } from "../../util/string.js"
import { renderZodError } from "../../config/zod.js"
import { CloudApiError } from "../../exceptions.js"
import type { CreateCachedActionRequest, GetCachedActionRequest } from "../../cloud/api.js"
import { actionReferenceToString } from "../../actions/base.js"

export class GardenCloudV1ResultCache<A extends CacheableAction, R extends CacheableResult> extends AbstractResultCache<
  A,
  R
> {
  private readonly schemaVersion: SchemaVersion

  constructor({
    schemaVersion,
    maxLogLength,
    resultValidator,
  }: {
    cacheDir: string
    schemaVersion: SchemaVersion
    maxLogLength: number
    resultValidator: ResultValidator<R>
  }) {
    super({ maxLogLength, resultValidator })
    this.schemaVersion = schemaVersion
  }

  public async clear(_: ClearResultParams<A>): Promise<void> {
    // Cache invalidation is not supported in Garden Cloud V1
    return
  }

  public async load({ ctx, log, action }: LoadResultParams<A>): Promise<R | undefined> {
    const cloudApi = ctx.cloudApi
    if (!cloudApi) {
      log.warn(`You are not logged in. Please log in to Garden Cloud to use the Team Cache feature.`)
      return
    }

    const cacheKey = this.cacheKey({ ctx, action })

    const request: GetCachedActionRequest = {
      schemaVersion: this.schemaVersion,
      // todo: ensure the project id presence
      projectId: ctx.projectId!,
      actionRef: actionReferenceToString(action),
      actionType: action.type,
      cacheKey,
    }

    try {
      const response = await cloudApi.getActionResult(request)
      const data = response.data
      if (!data.found) {
        log.debug(`Got Team Cache miss for key=${cacheKey}`)
        return undefined
      }

      const cachedValue = data.result
      // fixme: date types
      // return this.validateResult(cachedValue, log)
      return cachedValue as any
    } catch (e) {
      if (!(e instanceof CloudApiError)) {
        throw e
      }

      // todo: error handling
      return undefined
    }
  }

  public async store({ ctx, log, action, result }: StoreResultParams<A, R>): Promise<R | undefined> {
    const cloudApi = ctx.cloudApi
    if (!cloudApi) {
      log.warn(`You are not logged in. Please log in to Garden Cloud to use the Team Cache feature.`)
      return
    }

    const validatedResult = this.validateResult(result, log)
    if (validatedResult === undefined) {
      return undefined
    }

    const trimmedResult = this.trimResult(validatedResult)

    const cacheKey = this.cacheKey({ ctx, action })

    const request: CreateCachedActionRequest = {
      schemaVersion: this.schemaVersion,
      // todo: ensure the project id presence
      projectId: ctx.projectId!,
      actionRef: actionReferenceToString(action),
      actionType: action.type,
      cacheKey,
      result,
      startedAt: result.startedAt.toUTCString(),
      completedAt: result.completedAt.toUTCString(),
    }
    await cloudApi.createActionResult(request)

    return trimmedResult
  }

  private validateResult(data: R, log: Log) {
    const result = this.resultValidator(data)
    if (result.success) {
      return result.data
    } else {
      const errorMessage = deline`
      The provided result doesn't match the expected schema.
      Here is the output: ${renderZodError(result.error)}
      `
      log.debug(errorMessage)
      return undefined
    }
  }
}
