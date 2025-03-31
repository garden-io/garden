/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string.js"
import type { PluginContext } from "../../../plugin-context.js"
import { pluginContextSchema } from "../../../plugin-context.js"
import type { PluginActionContextParams } from "../../base.js"
import { logEntrySchema } from "../../base.js"
import type { BuildDependencyConfig } from "../../../config/module.js"
import type { ActionReference } from "../../../config/common.js"
import { joi, joiArray } from "../../../config/common.js"
import type { Log } from "../../../logger/log-entry.js"
import type { GroupConfig } from "../../../config/group.js"
import { groupConfig } from "../../../config/group.js"
import type { GardenModule } from "../../../types/module.js"
import { moduleSchema } from "../../../types/module.js"
import { baseActionConfigSchema } from "../../../actions/base.js"
import type { ActionConfig } from "../../../actions/types.js"
import type { BuildActionConfig, BuildCopyFrom } from "../../../actions/build.js"
import { buildActionConfigSchema } from "../../../actions/build.js"
import type { GardenService } from "../../../types/service.js"
import { serviceSchema } from "../../../types/service.js"
import type { GardenTest } from "../../../types/test.js"
import { testSchema } from "../../../types/test.js"
import type { GardenTask } from "../../../types/task.js"
import { taskSchema } from "../../../types/task.js"
import type { ExecBuildConfig } from "../../../plugins/exec/build.js"

export interface ConvertModuleParams<T extends GardenModule = GardenModule> extends PluginActionContextParams {
  ctx: PluginContext
  log: Log
  module: T
  services: GardenService<T>[]
  tasks: GardenTask<T>[]
  tests: GardenTest<T>[]
  dummyBuild: ExecBuildConfig | undefined
  baseFields: {
    copyFrom: BuildCopyFrom[]
    disabled: boolean
    internal: {
      basePath: string
    }
    source?: {
      repository?: {
        url: string
      }
    }
  }
  convertTestName: (d: string) => string
  convertBuildDependency: (d: string | BuildDependencyConfig) => ActionReference
  convertRuntimeDependencies: (d: string[]) => ActionReference[]
  prepareRuntimeDependencies: (deps: string[], build: BuildActionConfig<string, any> | undefined) => ActionReference[]
}

export interface ConvertModuleResult {
  group?: GroupConfig
  actions?: ActionConfig[]
}

export const convert = () => ({
  description: dedent`
    Validate and convert the given module configuration to a Group containing its atomic _action_ components (i.e. Build, Deploy, Run and Test), and/or individual actions. This is to allow backwards-compatibility from the Module configuration format to the newer action-oriented configuration style.

    The module config will be fully validated and resolved when passed to this handler.

    The names of the returned actions must match the expected names based on the module config. If a Build action is returned, there must be only one and it must be named the same as the module. Deploy and Run actions returned must have corresponding service and task names in the module. Tests must be named "<module name>-<test name in module>". Any unexpected action names will cause a validation error.

    See the parameter schema for helpers that are provided to facilitate the conversion.

    This handler is called on every resolution of the project graph, so it should return quickly and avoid doing any network calls.
  `,

  paramsSchema: joi.object().keys({
    ctx: pluginContextSchema().required(),
    log: logEntrySchema().required(),
    module: moduleSchema().required().description("The resolved Module to convert."),
    services: joiArray(serviceSchema()).description("Any Services belonging to the Module."),
    tasks: joiArray(taskSchema()).description("Any Tasks belonging to the Module."),
    tests: joiArray(testSchema()).description("Any Tests belonging to the Module."),
    dummyBuild: buildActionConfigSchema().description(
      "If a Build is required (i.e. if the Module uses any features that necessitate a Build action), this dummy exec Build is provided as a convenience. If an actual Build is created based on the Module, this config can be used as a base, since it sets some fields that would be needed on the returned Build, such as `copyFrom`."
    ),
    baseFields: joi
      .object()
      .unknown(true)
      .required()
      .description("Fields that should generally be applied to all returned actions, based on the input Module."),
    convertTestName: joi
      .function()
      .description(
        "A helper that accepts a test name from the module and returns the correct action name for the converted test."
      ),
    convertBuildDependency: joi
      .function()
      .description(
        "A helper that accepts an entry from `build.dependencies` on a Module and returns the corresponding Build action reference."
      ),
    convertRuntimeDependencies: joi
      .function()
      .description(
        "A helper that accepts a runtime dependency reference (i.e. a name of a Service or Task) and returns the corresponding Deploy or Run action reference."
      ),
    prepareRuntimeDependencies: joi
      .function()
      .description(
        "Take a list of declared dependencies on a service, task or test, and a Build action (if any) and return the appropriate list of dependencies for the converted action."
      ),
  }),

  resultSchema: joi.object().keys({
    group: groupConfig().keys({
      path: joi.string().required(),
    }),
    // Further validation happens later
    actions: joi.array().items(baseActionConfigSchema().unknown(true)),
  }),
})
