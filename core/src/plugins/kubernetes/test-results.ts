/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { TestActionHandler } from "../../plugin/action-types.js"
import { getTestResultCache } from "./results-cache.js"
import { toActionStatus } from "./util.js"
import { getActionNamespaceStatus } from "./namespace.js"
import type { KubernetesPluginContext } from "./config.js"
import type { KubernetesRunResult } from "../../plugin/base.js"
import { printEmoji } from "../../logger/util.js"
import { renderSavedTime } from "./results-cache-base.js"

// TODO: figure out how to get rid of the any cast
export const k8sGetTestResult: TestActionHandler<"getResult", any> = async (params) => {
  const { action, ctx, log } = params
  const cache = getTestResultCache(ctx)
  const cachedResult = await cache.load({ action, ctx, keyData: undefined, log })

  if (!cachedResult.found) {
    log.info(`Garden ${cache.brandName} miss ${printEmoji("❌", log)} (${cachedResult.notFoundReason})`)

    return { state: "not-ready", detail: null, outputs: { log: "" } }
  }

  // Fetch namespace status if we got a cache hit
  const k8sCtx = ctx as KubernetesPluginContext
  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })

  const result = cachedResult.result
  log.info(`Garden ${cache.brandName} hit ${printEmoji("✅", log)} ${renderSavedTime(result)}`)

  return toActionStatus<KubernetesRunResult>({ ...result, namespaceStatus })
}
