/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerTestAction } from "../container/moduleConfig.js"
import type { PluginContext } from "../../plugin-context.js"
import { hashSync } from "hasha"
import type { TestActionHandler } from "../../plugin/action-types.js"
import type { HelmPodTestAction } from "./helm/config.js"
import type { KubernetesTestAction } from "./kubernetes-type/config.js"
import type {
  CacheableResult,
  ClearResultParams,
  LoadResultParams,
  ResultCache,
  StoreResultParams,
} from "./results-cache.js"
import { toActionStatus } from "./results-cache.js"

// TODO: figure out how to get rid of the any cast
export const k8sGetTestResult: TestActionHandler<"getResult", any> = async (params) => {
  const { action, ctx, log } = params
  const cachedResult = await testResultCache.load({ action, ctx, log })

  if (!cachedResult) {
    return { state: "not-ready", detail: null, outputs: { log: "" } }
  }

  return toActionStatus(cachedResult)
}

export type CacheableTestAction = ContainerTestAction | KubernetesTestAction | HelmPodTestAction

export class TestResultCache implements ResultCache<CacheableTestAction, CacheableResult> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async load({ action, ctx, log }: LoadResultParams<CacheableTestAction>): Promise<CacheableResult | undefined> {
    //todo
    return undefined
  }

  public async store({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    action,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ctx,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    log,
    result,
  }: StoreResultParams<CacheableTestAction, CacheableResult>): Promise<CacheableResult> {
    //todo
    return result
  }

  public async clear(_: ClearResultParams<CacheableTestAction>): Promise<void> {
    // not supported yet - todo
    return
  }

  cacheKey(ctx: PluginContext, action: CacheableTestAction): string {
    // change the result format version if the result format changes breaking backwards-compatibility e.g. serialization format
    const resultFormatVersion = 3
    const key = `${ctx.projectName}--${action.name}--${action.versionString()}--${resultFormatVersion}`
    const hash = hashSync(key, { algorithm: "sha1" })
    return `test-result--${hash.slice(0, 32)}`
  }
}

export const testResultCache = new TestResultCache()
