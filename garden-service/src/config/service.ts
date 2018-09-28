/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { PrimitiveMap, joiIdentifier, joiIdentifierMap, joiPrimitive, joiArray } from "./common"

export interface ServiceSpec { }

export interface BaseServiceSpec extends ServiceSpec {
  name: string
  dependencies: string[]
  outputs: PrimitiveMap
}

export const serviceOutputsSchema = joiIdentifierMap(joiPrimitive())

export const baseServiceSchema = Joi.object()
  .keys({
    name: joiIdentifier().required(),
    dependencies: joiArray(joiIdentifier())
      .description("The names of services that this service depends on at runtime."),
    outputs: serviceOutputsSchema,
  })
  .unknown(true)
  .meta({ extendable: true })
  .description("The required attributes of a service. This is generally further defined by plugins.")

export interface ServiceConfig<T extends ServiceSpec = ServiceSpec> extends BaseServiceSpec {
  // Plugins can add custom fields that are kept here
  spec: T
}

export const serviceConfigSchema = baseServiceSchema
  .keys({
    spec: Joi.object()
      .meta({ extendable: true })
      .description("The service's specification, as defined by its provider plugin."),
  })
  .description("The configuration for a module's service.")
