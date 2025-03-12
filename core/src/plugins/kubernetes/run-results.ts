/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerRunAction } from "../container/moduleConfig.js"
import type { PluginContext } from "../../plugin-context.js"
import { hashSync } from "hasha"
import type { RunActionHandler } from "../../plugin/action-types.js"
import type { HelmPodRunAction } from "./helm/config.js"
import type { KubernetesRunAction } from "./kubernetes-type/config.js"
import type {
  CacheableResult,
  ClearResultParams,
  LoadResultParams,
  ResultCache,
  StoreResultParams,
} from "./results-cache.js"
import { toActionStatus } from "./results-cache.js"

// TODO: figure out how to get rid of the any cast here
export const k8sGetRunResult: RunActionHandler<"getResult", any> = async (params) => {
  const { action, ctx, log } = params
  const cachedResult = await runResultCache.load({ action, ctx, log })

  if (!cachedResult) {
    return { state: "not-ready", detail: null, outputs: { log: "" } }
  }

  return toActionStatus(cachedResult)
}

export type CacheableRunAction = ContainerRunAction | KubernetesRunAction | HelmPodRunAction

export class RunResultCache implements ResultCache<CacheableRunAction, CacheableResult> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async load({ action, ctx, log }: LoadResultParams<CacheableRunAction>): Promise<CacheableResult | undefined> {
    // todo
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
  }: StoreResultParams<CacheableRunAction, CacheableResult>): Promise<CacheableResult> {
    // todo
    return result
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async clear({ action, ctx, log }: ClearResultParams<CacheableRunAction>): Promise<void> {
    // todo
  }

  cacheKey(ctx: PluginContext, action: CacheableRunAction): string {
    // change the result format version if the result format changes breaking backwards-compatibility e.g. serialization format
    const resultFormatVersion = 2
    const key = `${ctx.projectName}--${action.type}.${action.name}--${action.versionString()}--${resultFormatVersion}`
    const hash = hashSync(key, { algorithm: "sha1" })
    return `run-result--${hash.slice(0, 32)}`
  }
}

export const runResultCache = new RunResultCache()
