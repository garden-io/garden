/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginContext } from "../../plugin-context.js"
import type { Log } from "../../logger/log-entry.js"
import { runResultSchemaZod } from "../../plugin/base.js"
import type { RunAction } from "../../actions/run.js"
import type { TestAction } from "../../actions/test.js"
import type { AnyZodObject } from "zod"
import type { z } from "zod"
import { deline, stableStringify } from "../../util/string.js"
import type { ContainerRunAction, ContainerTestAction } from "../container/config.js"
import type { KubernetesRunAction, KubernetesTestAction } from "./kubernetes-type/config.js"
import type { HelmPodRunAction, HelmPodTestAction } from "./helm/config.js"
import { renderZodError } from "../../config/zod.js"
import type { JsonObject } from "type-fest"
import { GardenError } from "../../exceptions.js"
import { fullHashStrings } from "../../vcs/vcs.js"
import type { Action } from "../../actions/types.js"

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
export const kubernetesCacheEntrySchema = runResultSchemaZod
export type KubernetesCacheEntrySchema = typeof kubernetesCacheEntrySchema

export interface LoadResultParams<A extends CacheableAction, AdditionalKeyData> {
  ctx: PluginContext
  log: Log
  action: A
  keyData: AdditionalKeyData
}

export type ClearResultParams<A extends CacheableAction, AdditionalKeyData> = LoadResultParams<A, AdditionalKeyData>

export interface StoreResultParams<A extends CacheableAction, AdditionalKeyData, R> {
  ctx: PluginContext
  log: Log
  action: A
  keyData: AdditionalKeyData
  result: R
}

export class StructuredCacheKey<AdditionalKeyData> {
  private readonly actionVersion: string
  private readonly keyData: AdditionalKeyData

  constructor({ action, keyData }: { action: CacheableAction; keyData: AdditionalKeyData }) {
    this.actionVersion = action.versionStringFull()
    this.keyData = keyData
  }

  public calculate(): string {
    const optionalSuffix = this.keyData === undefined ? "" : `-${fullHashStrings([stableStringify(this.keyData)])}`
    return `${this.actionVersion}${optionalSuffix}`
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
  get(key: string, action: Action): Promise<JsonObject>

  /**
   * Stores the value associated with the {@code key}.
   *
   * Returns the value back if it was written successfully,
   * or throws a {@link CacheStorageError} otherwise.
   */
  put(key: string, value: JsonObject, action: Action): Promise<JsonObject>

  /**
   * Removes a value associated with the {@code key}.
   *
   * Throws a {@link CacheStorageError} if any error occurred.
   */
  remove(key: string, action: Action): Promise<void>
}

export class ResultCache<A extends CacheableAction, ResultSchema extends AnyZodObject, AdditionalKeyData> {
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

  protected cacheKey({ action, keyData }: { action: CacheableAction; keyData: AdditionalKeyData }): string {
    const structuredCacheKey = new StructuredCacheKey<AdditionalKeyData>({ action, keyData })
    return structuredCacheKey.calculate()
  }

  public async clear({ log, action, keyData }: ClearResultParams<A, AdditionalKeyData>): Promise<void> {
    const key = this.cacheKey({ action, keyData })
    try {
      await this.cacheStorage.remove(key, action)
    } catch (e) {
      if (!(e instanceof CacheStorageError)) {
        throw e
      }

      log.debug(e.message)
    }
  }

  public async load({
    action,
    keyData,
    log,
  }: LoadResultParams<A, AdditionalKeyData>): Promise<z.output<ResultSchema> | undefined> {
    const key = this.cacheKey({ action, keyData })
    let cachedValue: JsonObject
    try {
      cachedValue = await this.cacheStorage.get(key, action)
    } catch (e) {
      if (!(e instanceof CacheStorageError)) {
        throw e
      }

      log.debug(e.message)
      return undefined
    }

    return this.validateResult(cachedValue, log)
  }

  public async store({
    action,
    log,
    keyData,
    result,
  }: StoreResultParams<A, AdditionalKeyData, z.input<ResultSchema>>): Promise<z.output<ResultSchema> | undefined> {
    const validatedResult = this.validateResult(result, log)
    if (validatedResult === undefined) {
      return undefined
    }

    const key = this.cacheKey({ action, keyData })
    try {
      return await this.cacheStorage.put(key, validatedResult, action)
    } catch (e) {
      if (!(e instanceof CacheStorageError)) {
        throw e
      }

      log.debug(e.message)
      return undefined
    }
  }
}
