/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { RunActionHandler } from "../../plugin/action-types.js"
import { getRunResultCache } from "./results-cache.js"
import { toActionStatus } from "./util.js"
import { getNamespaceStatus } from "./namespace.js"
import type { KubernetesPluginContext } from "./config.js"
import type { KubernetesRunResult } from "../../plugin/base.js"
import { renderSavedTime } from "./results-cache-base.js"
import { styles } from "../../logger/styles.js"

// TODO: figure out how to get rid of the any cast here
export const k8sGetRunResult: RunActionHandler<"getResult", any> = async (params) => {
  const { action, ctx, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const namespaceStatus = await getNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })
  if (namespaceStatus.state === "missing") {
    return { state: "not-ready", detail: null, outputs: { log: "" } }
  }

  const cache = getRunResultCache(ctx)
  const cachedResult = await cache.load({ action, ctx, keyData: { namespaceUid: namespaceStatus.namespaceUid }, log })

  const cacheInfo: KubernetesRunResult["cacheInfo"] = {
    cacheSource: cache.brandName,
    notFoundReason: undefined,
  }

  if (!cachedResult.found) {
    const reason = `(reason: ${cachedResult.notFoundReason})`
    cacheInfo.notFoundReason = cachedResult.notFoundReason
    log.info(`No cached result found in ${cache.brandName} ${styles.secondary(reason)}`)

    return { state: "not-ready", detail: null, outputs: { log: "" }, cacheInfo }
  }

  const result = cachedResult.result
  log.info(styles.success(`💥 Cached result found in ${cache.brandName} ${renderSavedTime(result)}`))

  return toActionStatus<KubernetesRunResult>({ ...cachedResult.result, namespaceStatus, cacheInfo })
}
