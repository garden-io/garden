/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginActionParamsBase } from "../../base.js"
import { projectActionParamsSchema } from "../../base.js"
import { dedent } from "../../../util/string.js"
import { joi } from "../../../config/common.js"
import type { BaseProviderConfig } from "../../../config/provider.js"

export interface DebugInfo {
  info: any
}

export interface DebugInfoMap {
  [key: string]: DebugInfo
}

export interface GetDebugInfoParams<C extends BaseProviderConfig = any> extends PluginActionParamsBase<C> {
  includeProject: boolean
}

export const getDebugInfo = () => ({
  description: dedent`
    Collects debug info from the provider.
  `,
  paramsSchema: projectActionParamsSchema().keys({
    includeProject: joi
      .boolean()
      .description("If set, include project-specific information from configured providers."),
  }),
  resultSchema: joi.object().keys({
    info: joi.any().required().description("An object representing the debug info for the project."),
  }),
})
