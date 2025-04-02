/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CleanupEnvironmentParams, CleanupEnvironmentResult } from "./handlers/Provider/cleanupEnvironment.js"
import { cleanupEnvironment } from "./handlers/Provider/cleanupEnvironment.js"
import type { ConfigureProviderParams, ConfigureProviderResult } from "./handlers/Provider/configureProvider.js"
import { configureProvider } from "./handlers/Provider/configureProvider.js"
import type { EnvironmentStatus, GetEnvironmentStatusParams } from "./handlers/Provider/getEnvironmentStatus.js"
import { getEnvironmentStatus } from "./handlers/Provider/getEnvironmentStatus.js"
import type { PrepareEnvironmentParams, PrepareEnvironmentResult } from "./handlers/Provider/prepareEnvironment.js"
import { prepareEnvironment } from "./handlers/Provider/prepareEnvironment.js"
import type { ActionHandler, ResolvedActionHandlerDescriptions } from "./base.js"
import { mapValues } from "lodash-es"
import type { DebugInfo, GetDebugInfoParams } from "./handlers/Provider/getDebugInfo.js"
import { getDebugInfo } from "./handlers/Provider/getDebugInfo.js"
import type { AugmentGraphResult, AugmentGraphParams } from "./handlers/Provider/augmentGraph.js"
import { augmentGraph } from "./handlers/Provider/augmentGraph.js"
import type { GetDashboardPageParams, GetDashboardPageResult } from "./handlers/Provider/getDashboardPage.js"
import { getDashboardPage } from "./handlers/Provider/getDashboardPage.js"
import { baseHandlerSchema } from "./handlers/base/base.js"
import type { BaseProviderConfig } from "../config/provider.js"

export type ProviderHandlers<C extends BaseProviderConfig = any, O extends object = any> = {
  [P in keyof ProviderActionParams]: ActionHandler<ProviderActionParams<C>[P], ProviderActionOutputs<C, O>[P]>
}

export type ProviderActionName = keyof ProviderHandlers

export interface ProviderActionParams<C extends BaseProviderConfig = any> {
  configureProvider: ConfigureProviderParams<C>
  augmentGraph: AugmentGraphParams<C>

  getEnvironmentStatus: GetEnvironmentStatusParams<C>
  prepareEnvironment: PrepareEnvironmentParams<C>
  cleanupEnvironment: CleanupEnvironmentParams<C>

  getDashboardPage: GetDashboardPageParams<C>
  getDebugInfo: GetDebugInfoParams<C>
}

export interface ProviderActionOutputs<C extends BaseProviderConfig = any, O extends object = any> {
  configureProvider: ConfigureProviderResult<C>
  augmentGraph: AugmentGraphResult

  // Deprecated: Will be removed in 0.14
  getEnvironmentStatus: EnvironmentStatus<O>
  prepareEnvironment: PrepareEnvironmentResult<O>
  cleanupEnvironment: CleanupEnvironmentResult

  getDashboardPage: GetDashboardPageResult
  getDebugInfo: DebugInfo
}

// It takes a short while to resolve all these schemas, so we cache the result
let _providerActionDescriptions: ResolvedActionHandlerDescriptions

export function getProviderActionDescriptions(): ResolvedActionHandlerDescriptions {
  if (_providerActionDescriptions) {
    return _providerActionDescriptions
  }

  const descriptions = {
    configureProvider,
    augmentGraph,

    // Deprecated: Will be removed in 0.14
    getEnvironmentStatus,
    prepareEnvironment,
    cleanupEnvironment,

    getDashboardPage,
    getDebugInfo,
  }

  _providerActionDescriptions = <ResolvedActionHandlerDescriptions>mapValues(descriptions, (f, name) => {
    const desc = f()

    return {
      ...desc,
      name,
      paramsSchema: desc.paramsSchema.keys({
        base: baseHandlerSchema(),
      }),
    }
  })

  return _providerActionDescriptions
}

export function getProviderHandlerNames() {
  return <ProviderActionName[]>Object.keys(getProviderActionDescriptions())
}
