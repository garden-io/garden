/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import dedent = require("dedent")
import { ProviderConfig, Provider, providerConfigBaseSchema, projectNameSchema } from "../../../config/project"
import { LogEntry } from "../../../logger/log-entry"
import { logEntrySchema } from "../base"

export interface ConfigureProviderParams<T extends ProviderConfig = any> {
  config: T
  log: LogEntry
  projectName: string
}

export interface ConfigureProviderResult<T extends ProviderConfig = ProviderConfig> extends Provider<T> { }

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
    }),
  resultSchema: Joi.object()
    .keys({
      config: providerConfigBaseSchema,
    }),
}
