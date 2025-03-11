/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginContext } from "../../plugin-context.js"
import type { Log } from "../../logger/log-entry.js"
import type { Action } from "../../actions/types.js"
import type { RunResult } from "../../plugin/base.js"
import type { NamespaceStatus } from "../../types/namespace.js"
import type { RunAction } from "../../actions/run.js"
import type { TestAction } from "../../actions/test.js"

export type CacheableResult = RunResult & {
  namespaceStatus: NamespaceStatus
  actionName: string
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
  action,
  namespaceStatus,
}: {
  result: RunResult
  action: Action
  namespaceStatus: NamespaceStatus
}): CacheableResult {
  return {
    ...result,
    namespaceStatus,
    actionName: action.name,
  }
}
