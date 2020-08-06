/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { GardenModule } from "../../module"
import { PluginContext, pluginContextSchema } from "../../../plugin-context"
import { logEntrySchema, PluginActionContextParams } from "../base"
import { baseModuleSpecSchema, ModuleConfig, moduleConfigSchema } from "../../../config/module"
import { joi } from "../../../config/common"
import { LogEntry } from "../../../logger/log-entry"

export interface ConfigureModuleParams<T extends GardenModule = GardenModule> extends PluginActionContextParams {
  ctx: PluginContext
  log: LogEntry
  moduleConfig: T["_config"]
}

export interface ConfigureModuleResult<T extends GardenModule = GardenModule> {
  moduleConfig: ModuleConfig<
    T["spec"],
    T["serviceConfigs"][0]["spec"],
    T["testConfigs"][0]["spec"],
    T["taskConfigs"][0]["spec"]
  >
}

export const configure = () => ({
  description: dedent`
    Validate and transform the given module configuration.

    Note that this does not need to perform structural schema validation (the framework does that
    automatically), but should in turn perform semantic validation to make sure the configuration is sane.

    This can and should also be used to further specify the semantics of the module, including service
    configuration and test configuration. Since services and tests are not specified using built-in
    framework configuration fields, this action needs to specify those via the \`serviceConfigs\` and
    \`testConfigs\` output keys.

    This action is called on every execution of Garden, so it should return quickly and avoid doing
    any network calls.
  `,

  paramsSchema: joi.object().keys({
    ctx: pluginContextSchema().required(),
    log: logEntrySchema(),
    moduleConfig: baseModuleSpecSchema().required(),
  }),

  resultSchema: joi.object().keys({
    moduleConfig: moduleConfigSchema(),
  }),
})
