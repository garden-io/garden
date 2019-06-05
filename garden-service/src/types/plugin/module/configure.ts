/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { PluginContext, pluginContextSchema } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { logEntrySchema } from "../base"
import { baseModuleSpecSchema, ModuleConfig, moduleConfigSchema } from "../../../config/module"

export interface ConfigureModuleParams<T extends Module = Module> {
  ctx: PluginContext
  log: LogEntry
  moduleConfig: T["_ConfigType"]
}

export type ConfigureModuleResult<T extends Module = Module> = ModuleConfig<
  T["spec"],
  T["serviceConfigs"][0]["spec"],
  T["testConfigs"][0]["spec"],
  T["taskConfigs"][0]["spec"]
>

export const configure = {
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

  paramsSchema: Joi.object()
    .keys({
      ctx: pluginContextSchema
        .required(),
      log: logEntrySchema,
      moduleConfig: baseModuleSpecSchema
        .required(),
    }),

  resultSchema: moduleConfigSchema,
}
