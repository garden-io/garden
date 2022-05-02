/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Action } from "../../actions/base"
import { ModuleConfigContext, ModuleConfigContextParams } from "./module"

export interface ActionConfigContextParams extends ModuleConfigContextParams {}

/**
 * Used to resolve action configurations.
 */
export class ActionConfigContext extends ModuleConfigContext {
  constructor(params: ActionConfigContextParams) {
    super(params)

    // TODO-G2
  }

  static fromAction(params: Omit<ActionConfigContextParams, "buildPath"> & { action: Action }) {
    const { action, garden } = params

    const internal = action.getConfig("internal") || {}

    return new ModuleConfigContext({
      ...params,
      name: action.name,
      path: action.basePath(),
      buildPath: action.getBuildPath(),
      parentName: internal.parentName,
      templateName: internal.templateName,
      inputs: internal.inputs,
      variables: { ...garden.variables, ...params.variables },
    })
  }
}
