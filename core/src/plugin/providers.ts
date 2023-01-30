/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  CleanupEnvironmentParams,
  CleanupEnvironmentResult,
  cleanupEnvironment,
} from "./handlers/Provider/cleanupEnvironment"
import {
  ConfigureProviderParams,
  ConfigureProviderResult,
  configureProvider,
} from "./handlers/Provider/configureProvider"
import {
  EnvironmentStatus,
  GetEnvironmentStatusParams,
  getEnvironmentStatus,
} from "./handlers/Provider/getEnvironmentStatus"
import {
  PrepareEnvironmentParams,
  PrepareEnvironmentResult,
  prepareEnvironment,
} from "./handlers/Provider/prepareEnvironment"
import { ActionHandler, ResolvedActionHandlerDescriptions } from "./base"
import { mapValues } from "lodash"
import { getDebugInfo, DebugInfo, GetDebugInfoParams } from "./handlers/Provider/getDebugInfo"
import { AugmentGraphResult, AugmentGraphParams, augmentGraph } from "./handlers/Provider/augmentGraph"
import { GetDashboardPageParams, GetDashboardPageResult, getDashboardPage } from "./handlers/Provider/getDashboardPage"
import { baseHandlerSchema } from "./handlers/base/base"

export type ProviderHandlers = {
  [P in keyof ProviderActionParams]: ActionHandler<ProviderActionParams[P], ProviderActionOutputs[P]>
}

export type ProviderActionName = keyof ProviderHandlers

export interface ProviderActionParams {
  configureProvider: ConfigureProviderParams
  augmentGraph: AugmentGraphParams

  getEnvironmentStatus: GetEnvironmentStatusParams
  prepareEnvironment: PrepareEnvironmentParams
  cleanupEnvironment: CleanupEnvironmentParams

  getDashboardPage: GetDashboardPageParams
  getDebugInfo: GetDebugInfoParams
}

export interface ProviderActionOutputs {
  configureProvider: ConfigureProviderResult
  augmentGraph: AugmentGraphResult

  getEnvironmentStatus: EnvironmentStatus
  prepareEnvironment: PrepareEnvironmentResult
  cleanupEnvironment: CleanupEnvironmentResult

  getDashboardPage: GetDashboardPageResult
  getDebugInfo: DebugInfo
}

// It takes a short while to resolve all these scemas, so we cache the result
let _providerActionDescriptions: ResolvedActionHandlerDescriptions

export function getProviderActionDescriptions(): ResolvedActionHandlerDescriptions {
  if (_providerActionDescriptions) {
    return _providerActionDescriptions
  }

  const descriptions = {
    configureProvider,
    augmentGraph,

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
