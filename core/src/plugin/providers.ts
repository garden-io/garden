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
} from "./handlers/provider/cleanupEnvironment"
import {
  ConfigureProviderParams,
  ConfigureProviderResult,
  configureProvider,
} from "./handlers/provider/configureProvider"
import { DeleteSecretParams, DeleteSecretResult, deleteSecret } from "./handlers/provider/deleteSecret"
import {
  EnvironmentStatus,
  GetEnvironmentStatusParams,
  getEnvironmentStatus,
} from "./handlers/provider/getEnvironmentStatus"
import { GetSecretParams, GetSecretResult, getSecret } from "./handlers/provider/getSecret"
import {
  PrepareEnvironmentParams,
  PrepareEnvironmentResult,
  prepareEnvironment,
} from "./handlers/provider/prepareEnvironment"
import { SetSecretParams, SetSecretResult, setSecret } from "./handlers/provider/setSecret"
import { ActionHandler, ResolvedActionHandlerDescriptions } from "./base"
import { mapValues } from "lodash"
import { getDebugInfo, DebugInfo, GetDebugInfoParams } from "./handlers/provider/getDebugInfo"
import { AugmentGraphResult, AugmentGraphParams, augmentGraph } from "./handlers/provider/augmentGraph"
import { GetDashboardPageParams, GetDashboardPageResult, getDashboardPage } from "./handlers/provider/getDashboardPage"
import { baseHandlerSchema } from "./handlers/base/base"

export type ProviderActionHandlers = {
  [P in keyof ProviderActionParams]: ActionHandler<ProviderActionParams[P], ProviderActionOutputs[P]>
}

// export type AllActionHandlers<T extends GardenModule = GardenModule> = PluginActionHandlers &
//   ModuleAndRuntimeActionHandlers<T>

export type ProviderActionName = keyof ProviderActionHandlers

export interface ProviderActionParams {
  configureProvider: ConfigureProviderParams
  augmentGraph: AugmentGraphParams

  getEnvironmentStatus: GetEnvironmentStatusParams
  prepareEnvironment: PrepareEnvironmentParams
  cleanupEnvironment: CleanupEnvironmentParams

  getSecret: GetSecretParams
  setSecret: SetSecretParams
  deleteSecret: DeleteSecretParams

  getDashboardPage: GetDashboardPageParams
  getDebugInfo: GetDebugInfoParams
}

export interface ProviderActionOutputs {
  configureProvider: ConfigureProviderResult
  augmentGraph: AugmentGraphResult

  getEnvironmentStatus: EnvironmentStatus
  prepareEnvironment: PrepareEnvironmentResult
  cleanupEnvironment: CleanupEnvironmentResult

  getSecret: GetSecretResult
  setSecret: SetSecretResult
  deleteSecret: DeleteSecretResult

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

    getSecret,
    setSecret,
    deleteSecret,

    getDashboardPage,
    getDebugInfo,
  }

  _providerActionDescriptions = <ResolvedActionHandlerDescriptions>mapValues(descriptions, (f) => {
    const desc = f()

    return {
      ...desc,
      paramsSchema: desc.paramsSchema.keys({
        base: baseHandlerSchema(),
      }),
    }
  })

  return _providerActionDescriptions
}

export function getProviderActionNames() {
  return <ProviderActionName[]>Object.keys(getProviderActionDescriptions())
}
