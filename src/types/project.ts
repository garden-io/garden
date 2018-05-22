/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import {
  joiArray,
  joiIdentifier,
  joiVariables,
  Primitive,
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

export interface ProjectConfig {
  name: string
  defaultEnvironment: string
  global: CommonEnvironmentConfig
  environments: EnvironmentConfig[]
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

export const providerConfigBase = Joi.object().keys({
  name: joiIdentifier().required(),
}).unknown(true)

export const environmentSchema = Joi.object().keys({
  configurationHandler: joiIdentifier(),
  providers: joiArray(providerConfigBase).unique("name"),
  variables: joiVariables(),
})

const defaultGlobal = {
  providers: defaultProviders,
  variables: {},
}

export const projectSchema = Joi.object().keys({
  name: joiIdentifier().required(),
  defaultEnvironment: Joi.string().default("", "<first specified environment>"),
  global: environmentSchema.default(() => defaultGlobal, JSON.stringify(defaultGlobal)),
  environments: joiArray(environmentSchema.keys({ name: joiIdentifier().required() }))
    .unique("name")
    .default(() => ({ ...defaultEnvironments }), JSON.stringify(defaultEnvironments)),
}).required()
