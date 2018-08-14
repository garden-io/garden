/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { safeDump } from "js-yaml"
import {
  joiArray,
  joiIdentifier,
  joiVariables,
  Primitive,
  remoteSourceSchema,
} from "./common"

export interface ProviderConfig {
  name: string
  [key: string]: any
}

export interface CommonEnvironmentConfig {
  configurationHandler?: string
  providers: ProviderConfig[]  // further validated by each plugin
  variables: { [key: string]: Primitive }
}

export interface EnvironmentConfig extends CommonEnvironmentConfig {
  name: string
}

export interface SourceConfig {
  name: string
  repositoryUrl: string
}

export interface ProjectConfig {
  name: string
  defaultEnvironment: string
  environmentDefaults: CommonEnvironmentConfig
  environments: EnvironmentConfig[]
  sources?: SourceConfig[]
}

export const defaultProviders = [
  { name: "container" },
]

export const defaultEnvironments: EnvironmentConfig[] = [
  {
    name: "local",
    providers: [
      {
        name: "local-kubernetes",
      },
    ],
    variables: {},
  },
]

export const providerConfigBase = Joi.object()
  .keys({
    name: joiIdentifier().required()
      .description("The name of the provider plugin to configure.")
      .example("local-kubernetes"),
  })
  .unknown(true)
  .meta({ extendable: true })

export const environmentSchema = Joi.object().keys({
  configurationHandler: joiIdentifier()
    .description(
      "Specify the provider that should store configuration variables for this environment. " +
      "Use this when you configure multiple providers that can manage configuration.",
    ),
  providers: joiArray(providerConfigBase)
    .unique("name")
    .description(
      "A list of providers that should be used for this environment, and their configuration. " +
      "Please refer to individual plugins/providers for details on how to configure them.",
    ),
  variables: joiVariables()
    .description("A key/value map of variables that modules can reference when using this environment."),
})

const environmentDefaults = {
  providers: [],
  variables: {},
}

export const projectSchema = Joi.object()
  .keys({
    name: joiIdentifier()
      .required()
      .description("The name of the project.")
      .example("my-sweet-project"),
    defaultEnvironment: Joi.string()
      .default("", "<first specified environment>")
      .description("The default environment to use when calling commands without the `--env` parameter."),
    environmentDefaults: environmentSchema
      .default(() => environmentDefaults, safeDump(environmentDefaults))
      .example(environmentDefaults)
      .description(
        "Default environment settings, that are inherited (but can be overridden) by each configured environment",
      ),
    environments: joiArray(environmentSchema.keys({ name: joiIdentifier().required() }))
      .unique("name")
      .default(() => ({ ...defaultEnvironments }), safeDump(defaultEnvironments))
      .description("A list of environments to configure for the project.")
      .example(defaultEnvironments),
    sources: joiArray(remoteSourceSchema)
      .unique("name")
      .description("A list of remote sources to import into project"),
  })
  .required()
  .description(
    "The configuration for a Garden project. This should be specified in the garden.yml file in your project root.",
  )
