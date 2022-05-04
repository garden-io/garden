/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Action } from "../../actions/base"
import { Garden } from "../../garden"
import { RuntimeContext } from "../../runtime-context"
import { GardenModule } from "../../types/module"
import { DeepPrimitiveMap } from "../common"
import { ProviderMap } from "../provider"
import { ModuleConfigContext } from "./module"

export interface ActionConfigContextParams {
  garden: Garden
  resolvedProviders: ProviderMap
  variables: DeepPrimitiveMap
  modules: GardenModule[]

  // We only supply this when resolving configuration in dependency order.
  // Otherwise we pass `${runtime.*} template strings through for later resolution.
  runtimeContext?: RuntimeContext
  partialRuntimeResolution: boolean

  action: Action
}


/**
 * Used to resolve action configurations.
 */
export class ActionConfigContext extends ModuleConfigContext {
  constructor(params: ActionConfigContextParams) {
    const { action, garden } = params

    const { internal } = action.getConfig()

    super({
      ...params,
      name: action.name,
      path: action.basePath(),
      buildPath: action.getBuildPath(),
      parentName: internal?.parentName,
      templateName: internal?.templateName,
      inputs: internal?.inputs,
      variables: { ...garden.variables, ...params.variables },
    })

    // TODO-G2
  }
}
