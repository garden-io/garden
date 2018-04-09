/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { EnvironmentConfig } from "./project"

export type Primitive = string | number | boolean

export interface PrimitiveMap { [key: string]: Primitive }
export interface DeepPrimitiveMap { [key: string]: Primitive | DeepPrimitiveMap }

export const joiPrimitive = () => Joi.alternatives().try(Joi.number(), Joi.string(), Joi.boolean())

export const identifierRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

export const joiIdentifier = () => Joi
  .string().regex(identifierRegex)
  .description(
    "may contain lowercase letters, numbers and dashes, must start with a letter, " +
    "cannot contain consecutive dashes and cannot end with a dash",
)

export const joiVariables = () => Joi
  .object().pattern(/[\w\d]+/i, joiPrimitive())
  .default(() => ({}), "{}")

export interface Environment {
  name: string
  namespace: string
  config: EnvironmentConfig,
}

export function isPrimitive(value: any) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}
