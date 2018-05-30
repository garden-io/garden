/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { JoiObject } from "joi"
import * as Joi from "joi"
import * as uuid from "uuid"
import { EnvironmentConfig } from "./project"
import { ConfigurationError, LocalConfigError } from "../exceptions"
import chalk from "chalk"

export type Primitive = string | number | boolean

export interface PrimitiveMap { [key: string]: Primitive }
export interface DeepPrimitiveMap { [key: string]: Primitive | DeepPrimitiveMap }

// export type ConfigWithSpec<S extends object> = <T extends S>{
//   spec: Omit<T, keyof S> & Partial<S>
// }

export const enumToArray = Enum => (
  Object.values(Enum).filter(k => typeof k === "string") as string[]
)

export const joiPrimitive = () => Joi.alternatives().try(Joi.number(), Joi.string(), Joi.boolean())
  .description("Number, string or boolean")

export const identifierRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
export const envVarRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export const joiIdentifier = () => Joi
  .string().regex(identifierRegex)
  .description(
    "Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, " +
    "and cannot end with a dash) and additionally cannot contain consecutive dashes",
)

export const joiIdentifierMap = (valueSchema: JoiObject) => Joi
  .object().pattern(identifierRegex, valueSchema)
  .default(() => ({}), "{}")
  .description("Key/value map, keys must be valid identifiers.")

export const joiVariables = () => Joi
  .object().pattern(/[\w\d]+/i, joiPrimitive())
  .default(() => ({}), "{}")
  .description("Key/value map, keys may contain letters and numbers, and values must be primitives.")

export const joiEnvVarName = () => Joi
  .string().regex(envVarRegex)
  .description(
    "Valid POSIX environment variable name (may contain letters, numbers and underscores and must start with a letter.",
)

export const joiEnvVars = () => Joi
  .object().pattern(envVarRegex, joiPrimitive())
  .default(() => ({}), "{}")
  .description("Key/value map, keys must be valid POSIX environment variable names, and values must be primitives.")

export const joiArray = (schema) => Joi
  .array().items(schema)
  .default(() => [], "[]")

export interface Environment {
  name: string
  namespace: string
  config: EnvironmentConfig,
}

export function isPrimitive(value: any) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

const joiPathPlaceholder = uuid.v4()
const joiPathPlaceholderRegex = new RegExp(joiPathPlaceholder, "g")
const joiOptions = {
  abortEarly: false,
  language: {
    key: `key ${joiPathPlaceholder} `,
    object: {
      allowUnknown: `!!key "{{!child}}" is not allowed at path ${joiPathPlaceholder}`,
      child: "!!\"{{!child}}\": {{reason}}",
      xor: `!!object at ${joiPathPlaceholder} only allows one of {{peersWithLabels}}`,
    },
  },
}

export interface ValidateOptions {
  context?: string
  ErrorClass?: typeof ConfigurationError | typeof LocalConfigError
}

export function validate<T>(
  value: T,
  schema: Joi.Schema,
  { context = "", ErrorClass = ConfigurationError }: ValidateOptions = {},
): T {
  const result = schema.validate(value, joiOptions)
  const error = result.error

  if (error) {
    const description = schema.describe()

    const errorDetails = error.details.map((e) => {
      // render the key path in a much nicer way
      let renderedPath = "."

      if (e.path.length) {
        renderedPath = ""
        let d = description

        for (const part of e.path) {
          if (d.children && d.children[part]) {
            renderedPath += "." + part
            d = d.children[part]
          } else if (d.patterns) {
            for (const p of d.patterns) {
              if (part.match(new RegExp(p.regex.slice(1, -1)))) {
                renderedPath += `[${part}]`
                d = p.rule
                break
              }
            }
          } else {
            renderedPath += `[${part}]`
          }
        }
      }

      // a little hack to always use full key paths instead of just the label
      e.message = e.message.replace(joiPathPlaceholderRegex, chalk.underline(renderedPath || "."))

      return e
    })

    const msgPrefix = context ? `Error validating ${context}` : "Validation error"
    const errorDescription = errorDetails.map(e => e.message).join(", ")

    throw new ErrorClass(`${msgPrefix}: ${errorDescription}`, {
      value,
      context,
      errorDescription,
      errorDetails,
    })
  }

  return result.value
}
