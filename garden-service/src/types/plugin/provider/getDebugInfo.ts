/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { actionParamsSchema, PluginActionParamsBase } from "../base"
import { dedent } from "../../../util/string"
import { joi } from "../../../config/common"

export interface DebugInfo {
  info: any
}

export interface DebugInfoMap {
  [key: string]: DebugInfo
}

export interface GetDebugInfoParams extends PluginActionParamsBase {
  includeProject: boolean
}

export const getDebugInfo = {
  description: dedent`
    Collects debug info from the provider.
  `,
  paramsSchema: actionParamsSchema.keys({
    includeProject: joi
      .boolean()
      .description("If set, include project-specific information from configured providers."),
  }),
  resultSchema: joi.object().keys({
    info: joi
      .any()
      .required()
      .description("An object representing the debug info for the project."),
  }),
}
