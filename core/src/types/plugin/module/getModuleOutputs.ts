/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deline } from "../../../util/string"
import { GardenModule } from "../../module"
import { PluginActionContextParams, logEntrySchema } from "../base"
import { joi, PrimitiveMap, joiVariables, moduleVersionSchema } from "../../../config/common"
import { templateStringLiteral } from "../../../docs/common"
import { ModuleVersion } from "../../../vcs/vcs"
import { LogEntry } from "../../../logger/log-entry"
import { pluginContextSchema } from "../../../plugin-context"
import { baseModuleSpecSchema } from "../../../config/module"

export interface GetModuleOutputsParams<T extends GardenModule = GardenModule> extends PluginActionContextParams {
  log: LogEntry
  moduleConfig: T["_config"]
  version: ModuleVersion
}

export interface GetModuleOutputsResult {
  outputs: PrimitiveMap
}

export const moduleOutputsSchema = () =>
  joiVariables().description("The outputs defined by the module (referenceable in other module configs).")

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
