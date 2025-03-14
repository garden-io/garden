/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { TestActionHandler } from "../../plugin/action-types.js"
import { getResultCache } from "./results-cache.js"
import { toActionStatus } from "./util.js"

// TODO: figure out how to get rid of the any cast
export const k8sGetTestResult: TestActionHandler<"getResult", any> = async (params) => {
  const { action, ctx, log } = params
  const cache = getResultCache(ctx.gardenDirPath)
  const cachedResult = await cache.load({ action, ctx, log })

  if (!cachedResult) {
    return { state: "not-ready", detail: null, outputs: { log: "" } }
  }

  return toActionStatus(cachedResult)
}
