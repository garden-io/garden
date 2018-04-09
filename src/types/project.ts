/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { extend } from "lodash"
import * as Joi from "joi"
import { identifierRegex, joiIdentifier, joiPrimitive, Primitive } from "./common"

export const defaultEnvironments = {
  local: {
    providers: {
      generic: {
        type: "generic",
      },
      containers: {
        type: "kubernetes",
        context: "docker-for-desktop",
      },
    },
  },
}

export interface ProviderConfig {
  type: string
  name?: string
}

export interface EnvironmentConfig {
  configurationHandler?: string
  providers: { [key: string]: ProviderConfig }
}

export interface ProjectConfig {
  version: string
  name: string
  defaultEnvironment: string
  environments: { [key: string]: EnvironmentConfig }
  variables: { [key: string]: Primitive }
}

export const providerConfigBase = Joi.object().keys({
  type: Joi.string().required(),
}).unknown(true)

export const projectSchema = Joi.object().keys({
  version: Joi.string().default("0").only("0"),
  name: joiIdentifier().required(),
  defaultEnvironment: Joi.string().default("", "<first specified environment>"),
  environments: Joi.object().pattern(identifierRegex, Joi.object().keys({
    configurationHandler: joiIdentifier(),
    providers: Joi.object().pattern(identifierRegex, providerConfigBase),
  })).default(() => extend({}, defaultEnvironments), JSON.stringify(defaultEnvironments)),
  variables: Joi.object().pattern(/[\w\d]+/i, joiPrimitive()).default(() => ({}), "{}"),
}).required()
