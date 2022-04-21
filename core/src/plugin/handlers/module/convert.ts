/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { PluginContext, pluginContextSchema } from "../../../plugin-context"
import { logEntrySchema, PluginActionContextParams } from "../../base"
import { baseModuleSpecSchema, BuildDependencyConfig, ModuleConfig } from "../../../config/module"
import { joi } from "../../../config/common"
import { LogEntry } from "../../../logger/log-entry"
import { GroupConfig, groupConfig } from "../../../config/group"

export interface ConvertModuleParams<T extends ModuleConfig = ModuleConfig> extends PluginActionContextParams {
  ctx: PluginContext
  log: LogEntry
  moduleConfig: T
  convertBuildDependency: (d: string | BuildDependencyConfig) => string
  convertRuntimeDependency: (d: string) => string
}

export interface ConvertModuleResult {
  group: GroupConfig
}

export const convertModule = () => ({
  description: dedent`
    Validate and convert the given module configuration to a Group containing its atomic _action_ components (i.e. Build, Deploy, Run and Test). This is to allow backwards-compatibility from the Module configuration format to the newer action-oriented configuration style.

    The module config will be fully validated and resolved when passed to this handler.

    The names of the returned actions must match the expected names based on the module config. If a Build action is returned, there must be only one and it must be named the same as the module. Deploy and Run actions returned must have corresponding service and task names in the module. Tests must be named "<module name>-<test name in module>". Any unexpected action names will cause a validation error.

    To convert dependencies, two helpers are provided for build dependencies and runtime dependencies, \`convertBuildDependency\` and \`convertRuntimeDependency\` respectively. These should be used to make sure dependency references map correctly to converted actions in other modules.

    This handler is called on every resolution of the project graph, so it should return quickly and avoid doing any network calls.
  `,

  paramsSchema: joi.object().keys({
    ctx: pluginContextSchema().required(),
    log: logEntrySchema(),
    moduleConfig: baseModuleSpecSchema().required(),
    convertBuildDependency: joi.function(),
    convertRuntimeDependency: joi.function(),
  }),

  resultSchema: joi.object().keys({
    group: groupConfig().required(),
  }),
})
