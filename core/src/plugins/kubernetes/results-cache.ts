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
import type { NamespaceStatus } from "../../types/namespace.js"
import type { RunAction } from "../../actions/run.js"
import type { TestAction } from "../../actions/test.js"
import { runResultToActionState } from "../../actions/base.js"
import { hashSync } from "hasha"
import type { CacheableRunAction } from "./run-results.js"

export type CacheableResult = RunResult & {
  namespaceStatus: NamespaceStatus
}

export interface LoadResultParams<A extends RunAction | TestAction> {
  ctx: PluginContext
  log: Log
  action: A
}

export type ClearResultParams<A extends RunAction | TestAction> = LoadResultParams<A>

export interface StoreResultParams<A extends RunAction | TestAction, R extends CacheableResult> {
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

export interface ResultCache<A extends RunAction | TestAction, R extends CacheableResult> {
  load(params: LoadResultParams<A>): Promise<R | undefined>

  store(params: StoreResultParams<A, R>): Promise<R>

  clear(param: ClearResultParams<A>): Promise<void>
}

export function cacheKey({ ctx, action }: { ctx: PluginContext; action: CacheableRunAction }): string {
  // change the result format version if the result format changes breaking backwards-compatibility e.g. serialization format
  const resultSchemaVersion = 1
  const key = `${ctx.projectName}--${action.type}.${action.name}--${action.versionString()}--${resultSchemaVersion}`
  const hash = hashSync(key, { algorithm: "sha1" })
  return `${action.kind.toLowerCase()}-result--${hash.slice(0, 32)}`
}
