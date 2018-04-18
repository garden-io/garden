/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import {
  identifierRegex,
  joiIdentifier,
  joiVariables,
  Primitive,
} from "./common"

export const defaultProviders = {
  container: {},
}

export const defaultEnvironments = {
  local: {
    providers: {
      kubernetes: {
        context: "docker-for-desktop",
      },
    },
  },
}

export interface ProviderConfig { }

export interface EnvironmentConfig {
  configurationHandler?: string
  providers: { [key: string]: ProviderConfig }
  variables: { [key: string]: Primitive }
}

export interface ProjectConfig {
  version: string
  name: string
  defaultEnvironment: string
  global: EnvironmentConfig
  environments: { [key: string]: EnvironmentConfig }
}

export const providerConfigBase = Joi.object().unknown(true)

export const environmentSchema = Joi.object().keys({
  configurationHandler: joiIdentifier(),
  providers: Joi.object().pattern(identifierRegex, providerConfigBase),
  variables: joiVariables(),
})

const defaultGlobal = {
  providers: defaultProviders,
  variables: {},
}

export const projectSchema = Joi.object().keys({
  version: Joi.string().default("0").only("0"),
  name: joiIdentifier().required(),
  defaultEnvironment: Joi.string().default("", "<first specified environment>"),
  global: environmentSchema.default(() => defaultGlobal, JSON.stringify(defaultGlobal)),
  environments: Joi.object()
    .pattern(identifierRegex, environmentSchema)
    .default(() => ({ ...defaultEnvironments }), JSON.stringify(defaultEnvironments)),
}).required()
