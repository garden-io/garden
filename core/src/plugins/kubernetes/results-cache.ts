/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginContext } from "../../plugin-context.js"
import type { Log } from "../../logger/log-entry.js"
import type { ActionStatus } from "../../actions/types.js"
import type { RunResult } from "../../plugin/base.js"
import { runResultSchemaZod } from "../../plugin/base.js"
import type { NamespaceStatus } from "../../types/namespace.js"
import { namespaceStatusSchema } from "../../types/namespace.js"
import type { RunAction } from "../../actions/run.js"
import type { TestAction } from "../../actions/test.js"
import { runResultToActionState } from "../../actions/base.js"
import { hashSync } from "hasha"
import { Memoize } from "typescript-memoize"
import type { SafeParseReturnType, z } from "zod"
import { tailString } from "../../util/string.js"
import type { ContainerRunAction, ContainerTestAction } from "../container/config.js"
import type { KubernetesRunAction, KubernetesTestAction } from "./kubernetes-type/config.js"
import type { HelmPodRunAction, HelmPodTestAction } from "./helm/config.js"
import { MAX_RUN_RESULT_LOG_LENGTH } from "./constants.js"
import { getLocalKubernetesRunResultsCacheDir, LocalResultCache } from "./results-cache-fs.js"

export type CacheableAction = RunAction | TestAction

export type CacheableRunAction = ContainerRunAction | KubernetesRunAction | HelmPodRunAction
export type CacheableTestAction = ContainerTestAction | KubernetesTestAction | HelmPodTestAction

export const kubernetesCacheableResultSchema = runResultSchemaZod.extend({
  namespaceStatus: namespaceStatusSchema.required(),
})

export type CacheableResult = z.infer<typeof kubernetesCacheableResultSchema>

export type ResultValidator<R> = (data: unknown) => SafeParseReturnType<unknown, R>

export interface LoadResultParams<A extends CacheableAction> {
  ctx: PluginContext
  log: Log
  action: A
}

export type ClearResultParams<A extends CacheableAction> = LoadResultParams<A>

export interface StoreResultParams<A extends CacheableAction, R extends CacheableResult> {
  ctx: PluginContext
  log: Log
  action: A
  result: R
}

export function composeCacheableResult({
  result,
  namespaceStatus,
}: {
  result: RunResult
  namespaceStatus: NamespaceStatus
}): CacheableResult {
  return {
    ...result,
    namespaceStatus,
  }
}

export function toActionStatus<T extends CacheableResult>(detail: T): ActionStatus {
  return { state: runResultToActionState(detail), detail, outputs: { log: detail.log } }
}

export interface ResultCache<A extends CacheableAction, R extends CacheableResult> {
  load(params: LoadResultParams<A>): Promise<R | undefined>

  store(params: StoreResultParams<A, R>): Promise<R | undefined>

  clear(param: ClearResultParams<A>): Promise<void>
}

export type SchemaVersion = `v${number}`

/**
 * Increment the current result schema format version
 * if the result format changes breaking backwards-compatibility,
 * e.g. serialization format.
 */
export const currentResultSchemaVersion: SchemaVersion = "v1"

export type CreateCacheableResultKeyParams = {
  schemaVersion: SchemaVersion
  ctx: PluginContext
  action: CacheableAction
}

export class StructuredCacheKey {
  private readonly schemaVersion: SchemaVersion
  private readonly projectName: string
  private readonly actionKind: string
  private readonly actionName: string
  private readonly actionType: string
  private readonly actionVersion: string

  constructor({ schemaVersion, ctx, action }: CreateCacheableResultKeyParams) {
    this.schemaVersion = schemaVersion
    this.projectName = ctx.projectName
    this.actionKind = action.kind
    this.actionName = action.name
    this.actionType = action.type
    this.actionVersion = action.versionString()
  }

  @Memoize()
  public calculate(): string {
    const key = `${this.projectName}--${this.actionType}.${this.actionName}--${this.actionVersion}--${this.schemaVersion}`
    const hash = hashSync(key, { algorithm: "sha1" })
    return `${this.actionKind.toLowerCase()}-result--${hash.slice(0, 32)}`
  }
}

export type CacheKeyProviderParams = {
  ctx: PluginContext
  action: CacheableAction
}

export type CacheKeyProvider = (params: CacheKeyProviderParams) => StructuredCacheKey

export function cacheKeyProviderFactory(schemaVersion: SchemaVersion): CacheKeyProvider {
  return ({ ctx, action }: CacheKeyProviderParams) => {
    return new StructuredCacheKey({ schemaVersion, ctx, action })
  }
}

export abstract class AbstractResultCache<A extends CacheableAction, R extends CacheableResult>
  implements ResultCache<A, R>
{
  private readonly cacheKeyProvider: CacheKeyProvider
  private readonly maxLogLength: number
  protected readonly resultValidator: ResultValidator<R>

  protected constructor({
    cacheKeyProvider,
    maxLogLength,
    resultValidator,
  }: {
    cacheKeyProvider: CacheKeyProvider
    maxLogLength: number
    resultValidator: ResultValidator<R>
  }) {
    this.cacheKeyProvider = cacheKeyProvider
    this.maxLogLength = maxLogLength
    this.resultValidator = resultValidator
  }

  protected cacheKey(params: CacheKeyProviderParams): string {
    const structuredCacheKey = this.cacheKeyProvider(params)
    return structuredCacheKey.calculate()
  }

  protected trimResult(result: R): R {
    const log = tailString(result.log, this.maxLogLength, true)

    return { ...result, log }
  }

  public abstract clear(param: ClearResultParams<A>): Promise<void>

  public abstract load(params: LoadResultParams<A>): Promise<R | undefined>

  public abstract store(params: StoreResultParams<A, R>): Promise<R | undefined>
}

let resultCache: LocalResultCache<CacheableRunAction | CacheableTestAction, CacheableResult> | undefined

export function getResultCache(
  gardenDirPath: string
): LocalResultCache<CacheableRunAction | CacheableTestAction, CacheableResult> {
  if (resultCache === undefined) {
    resultCache = new LocalResultCache<CacheableRunAction | CacheableTestAction, CacheableResult>({
      cacheDir: getLocalKubernetesRunResultsCacheDir(gardenDirPath),
      cacheKeyProvider: cacheKeyProviderFactory(currentResultSchemaVersion),
      maxLogLength: MAX_RUN_RESULT_LOG_LENGTH,
      resultValidator: kubernetesCacheableResultSchema.safeParse,
    })
  }
  return resultCache
}
