/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deline } from "../../../util/string.js"
import type { GardenModule } from "../../../types/module.js"
import type { PluginActionContextParams } from "../../base.js"
import { logEntrySchema } from "../../base.js"
import type { PrimitiveMap } from "../../../config/common.js"
import { joi, joiVariables, moduleVersionSchema } from "../../../config/common.js"
import { templateStringLiteral } from "../../../docs/common.js"
import type { ModuleVersion } from "../../../vcs/vcs.js"
import type { Log } from "../../../logger/log-entry.js"
import { pluginContextSchema } from "../../../plugin-context.js"
import { baseModuleSpecSchema } from "../../../config/module.js"
import { memoize } from "lodash-es"

export interface GetModuleOutputsParams<T extends GardenModule = GardenModule> extends PluginActionContextParams {
  log: Log
  moduleConfig: T["_config"]
  version: ModuleVersion
}

export interface GetModuleOutputsResult {
  outputs: PrimitiveMap
}

export const moduleOutputsSchema = memoize(() =>
  joiVariables().description("The outputs defined by the module (referenceable in other module configs).")
)

export const getModuleOutputs = () => ({
  description: deline`
    Resolve the outputs for the module, which are made available via
    ${templateStringLiteral("module.<name>.outputs.*")} template strings.
  `,

  paramsSchema: joi.object().keys({
    ctx: pluginContextSchema().required(),
    log: logEntrySchema(),
    moduleConfig: baseModuleSpecSchema().required(),
    version: moduleVersionSchema(),
  }),

  resultSchema: joi.object().keys({
    outputs: moduleOutputsSchema(),
  }),
})
