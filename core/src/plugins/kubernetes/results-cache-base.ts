/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginContext } from "../../plugin-context.js"
import type { Log } from "../../logger/log-entry.js"
import type { RunResult } from "../../plugin/base.js"
import { runResultSchemaZod } from "../../plugin/base.js"
import type { NamespaceStatus } from "../../types/namespace.js"
import { namespaceStatusSchema } from "../../types/namespace.js"
import type { RunAction } from "../../actions/run.js"
import type { TestAction } from "../../actions/test.js"
import { hashSync } from "hasha"
import type { AnyZodObject, z } from "zod"
import { deline } from "../../util/string.js"
import type { ContainerRunAction, ContainerTestAction } from "../container/config.js"
import type { KubernetesRunAction, KubernetesTestAction } from "./kubernetes-type/config.js"
import type { HelmPodRunAction, HelmPodTestAction } from "./helm/config.js"
import { renderZodError } from "../../config/zod.js"
import type { JsonObject } from "type-fest"
import { GardenError } from "../../exceptions.js"

export type CacheableAction = RunAction | TestAction

export type CacheableRunAction = ContainerRunAction | KubernetesRunAction | HelmPodRunAction
export type CacheableTestAction = ContainerTestAction | KubernetesTestAction | HelmPodTestAction

export type SchemaVersion = `v${number}`

/**
 * Increment the current result schema format version
 * if the result format changes breaking backwards-compatibility,
 * e.g. serialization format.
 */
export const currentResultSchemaVersion: SchemaVersion = "v1"

export const kubernetesCacheEntrySchema = runResultSchemaZod.extend({
  namespaceStatus: namespaceStatusSchema.required(),
})

export type KubernetesCacheEntrySchema = typeof kubernetesCacheEntrySchema

export function composeKubernetesCacheEntry({
  result,
  namespaceStatus,
}: {
  result: RunResult
  namespaceStatus: NamespaceStatus
}): z.input<KubernetesCacheEntrySchema> {
  return {
    ...result,
    namespaceStatus,
  }
}

export interface LoadResultParams<A extends CacheableAction> {
  ctx: PluginContext
  log: Log
  action: A
}

export type ClearResultParams<A extends CacheableAction> = LoadResultParams<A>

export interface StoreResultParams<A extends CacheableAction, R> {
  ctx: PluginContext
  log: Log
  action: A
  result: R
}

export class StructuredCacheKey {
  private readonly projectName: string
  private readonly actionKind: string
  private readonly actionName: string
  private readonly actionType: string
  private readonly actionVersion: string

  constructor({ ctx, action }: { ctx: PluginContext; action: CacheableAction }) {
    this.projectName = ctx.projectName
    this.actionKind = action.kind
    this.actionName = action.name
    this.actionType = action.type
    this.actionVersion = action.versionString()
  }

  public calculate(): string {
    const key = `${this.projectName}--${this.actionType}.${this.actionName}--${this.actionVersion}`
    const hash = hashSync(key, { algorithm: "sha1" })
    return `${this.actionKind.toLowerCase()}-result--${hash.slice(0, 32)}`
  }
}

export class CacheStorageError extends GardenError {
  type = "cache-storage"
}

export interface CacheStorage {
  /**
   * Returns a value associated with the {@code key},
   * or throws a {@link CacheStorageError} if no key was found or any error occurred.
   */
  get(key: string): Promise<JsonObject>

  /**
   * Stores the value associated with the {@code key}.
   *
   * Returns the value back if it was written successfully,
   * or throws a {@link CacheStorageError} otherwise.
   */
  put(key: string, value: JsonObject): Promise<JsonObject>

  /**
   * Removes a value associated with the {@code key}.
   *
   * Throws a {@link CacheStorageError} if any error occurred.
   */
  remove(key: string): Promise<void>
}

export class ResultCache<A extends CacheableAction, ResultSchema extends AnyZodObject> {
  private readonly cacheStorage: CacheStorage
  private readonly resultSchema: ResultSchema

  constructor({ cacheStorage, resultSchema }: { cacheStorage: CacheStorage; resultSchema: ResultSchema }) {
    this.cacheStorage = cacheStorage
    this.resultSchema = resultSchema
  }

  protected validateResult(data: unknown, log: Log): z.output<ResultSchema> | undefined {
    const result = this.resultSchema.safeParse(data)
    if (result.success) {
      return result.data
    }

    const errorMessage = deline`
      The provided result doesn't match the expected schema.
      Here is the output: ${renderZodError(result.error)}
      `
    log.debug(errorMessage)
    return undefined
  }

  protected cacheKey({ ctx, action }: { ctx: PluginContext; action: CacheableAction }): string {
    const structuredCacheKey = new StructuredCacheKey({ ctx, action })
    return structuredCacheKey.calculate()
  }

  public async clear({ ctx, log, action }: ClearResultParams<A>): Promise<void> {
    const key = this.cacheKey({ ctx, action })
    try {
      await this.cacheStorage.remove(key)
    } catch (e) {
      if (!(e instanceof CacheStorageError)) {
        throw e
      }

      action.createLog(log).debug(e.message)
    }
  }

  public async load({ ctx, action, log }: LoadResultParams<A>): Promise<z.output<ResultSchema> | undefined> {
    const key = this.cacheKey({ ctx, action })
    let cachedValue: JsonObject
    try {
      cachedValue = await this.cacheStorage.get(key)
    } catch (e) {
      if (!(e instanceof CacheStorageError)) {
        throw e
      }

      action.createLog(log).debug(e.message)
      return undefined
    }

    return this.validateResult(cachedValue, log)
  }

  public async store({
    ctx,
    action,
    log,
    result,
  }: StoreResultParams<A, z.input<ResultSchema>>): Promise<z.output<ResultSchema> | undefined> {
    const validatedResult = this.validateResult(result, log)
    if (validatedResult === undefined) {
      return undefined
    }

    const key = this.cacheKey({ ctx, action })
    try {
      return await this.cacheStorage.put(key, validatedResult)
    } catch (e) {
      if (!(e instanceof CacheStorageError)) {
        throw e
      }

      action.createLog(log).debug(e.message)
      return undefined
    }
  }
}
