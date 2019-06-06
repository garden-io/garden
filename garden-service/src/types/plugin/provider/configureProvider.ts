/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import dedent = require("dedent")
import { projectNameSchema } from "../../../config/project"
import { ProviderConfig, Provider, providerConfigBaseSchema, providersSchema } from "../../../config/provider"
import { LogEntry } from "../../../logger/log-entry"
import { logEntrySchema } from "../base"
import { configStoreSchema, ConfigStore } from "../../../config-store"
import { joiArray } from "../../../config/common"
import { moduleConfigSchema, ModuleConfig } from "../../../config/module"
import { deline } from "../../../util/string"

export interface ConfigureProviderParams<T extends ProviderConfig = any> {
  config: T
  log: LogEntry
  projectName: string
  dependencies: Provider[]
  configStore: ConfigStore
}

export interface ConfigureProviderResult<T extends ProviderConfig = ProviderConfig> {
  config: T
  moduleConfigs?: ModuleConfig[]
}

export const configureProvider = {
  description: dedent`
    Validate and transform the given provider configuration.

    Note that this does not need to perform structural schema validation (the framework does that
    automatically), but should in turn perform semantic validation to make sure the configuration is sane.

    This can also be used to further specify the semantics of the provider, including dependencies.

    Important: This action is called on most executions of Garden commands, so it should return quickly
    and avoid performing expensive processing or network calls.
  `,
  paramsSchema: Joi.object()
    .keys({
      config: providerConfigBaseSchema.required(),
      log: logEntrySchema,
      projectName: projectNameSchema,
      dependencies: providersSchema,
      configStore: configStoreSchema,
    }),
  resultSchema: Joi.object()
    .keys({
      config: providerConfigBaseSchema,
      moduleConfigs: joiArray(moduleConfigSchema)
        .description(deline`
          Providers may return one or more module configs, that are included with the provider. This can be used for
          modules that should always be built, or deployed as part of bootstrapping the provider.

          They become part of the project graph like other modules, but need to be referenced with the provider name
          as a prefix and a double dash, e.g. \`provider-name--module-name\`.
        `),
    }),
}
