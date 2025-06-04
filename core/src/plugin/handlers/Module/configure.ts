/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string.js"
import type { GardenModule } from "../../../types/module.js"
import type { PluginContext } from "../../../plugin-context.js"
import { pluginContextSchema } from "../../../plugin-context.js"
import type { PluginActionContextParams } from "../../../plugin/base.js"
import { logEntrySchema } from "../../../plugin/base.js"
import type { ModuleConfig } from "../../../config/module.js"
import { baseModuleSpecSchema, moduleConfigSchema } from "../../../config/module.js"
import { joi } from "../../../config/common.js"
import type { Log } from "../../../logger/log-entry.js"

export interface ConfigureModuleParams<T extends GardenModule = GardenModule> extends PluginActionContextParams {
  ctx: PluginContext
  log: Log
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

    Note that this does not need to perform structural schema validation (the framework does that automatically), but should in turn perform semantic validation to make sure the configuration is sane.

    This can and should also be used to further specify the semantics of the module, including service configuration and test configuration. Since services and tests are not specified using built-in framework configuration fields, this action needs to specify those via the \`serviceConfigs\` and \`testConfigs\` output keys.

    This action is called on every execution of Garden, so it should return quickly and avoid doing any network calls.
  `,

  paramsSchema: joi
    .object()
    .keys({
      ctx: pluginContextSchema().required(),
      log: logEntrySchema(),
      moduleConfig: baseModuleSpecSchema().required(),
    })
    .meta({ name: `handlers.module.configure.params` }),

  resultSchema: joi
    .object()
    .keys({
      moduleConfig: moduleConfigSchema(),
    })
    .meta({ name: `handlers.module.configure.result` }),
})
