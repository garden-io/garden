/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import { ConfigurationError, LocalConfigError } from "../exceptions"
import chalk from "chalk"
import { relative } from "path"
import { uuidv4 } from "../util/util"

export const joiPathPlaceholder = uuidv4()
const joiPathPlaceholderRegex = new RegExp(joiPathPlaceholder, "g")
const errorPrefs: any = {
  wrap: {
    label: "⟿↬",
  },
}
const joiLabelPlaceholderRegex = /⟿(.+)↬/g
const joiOptions: Joi.ValidationOptions = {
  abortEarly: false,
  // Overriding some error messages to make them friendlier
  messages: {
    "any.unknown": `{{#label}} is not allowed at path ${joiPathPlaceholder}`,
    "object.missing": `object at ${joiPathPlaceholder} must contain at least one of {{#peersWithLabels}}`,
    "object.nand": `{{#mainWithLabel}} can\'t be specified simultaneously with {{#peersWithLabels}}`,
    "object.unknown": `key "{{#child}}" is not allowed at path ${joiPathPlaceholder}`,
    "object.with": `"{{#mainWithLabel}}" must be specified with "{{#peerWithLabel}}"`,
    "object.without": `"{{#mainWithLabel}}" can\'t be specified with "{{#peerWithLabel}}"`,
    "object.xor": `object at ${joiPathPlaceholder} can only contain one of {{#peersWithLabels}}`,
  },
  errors: errorPrefs,
}

export interface ValidateOptions {
  context?: string // Descriptive text to include in validation error messages, e.g. "module at some/local/path"
  ErrorClass?: typeof ConfigurationError | typeof LocalConfigError
}

export interface ValidateWithPathParams<T> {
  config: T
  schema: Joi.Schema
  path: string // Absolute path to the config file, including filename
  projectRoot: string
  name?: string // Name of the top-level entity that the config belongs to, e.g. "some-module" or "some-project"
  configType: string // The type of top-level entity that the config belongs to, e.g. "module" or "project"
  ErrorClass?: typeof ConfigurationError | typeof LocalConfigError
}

/**
 * Should be used whenever a path to the corresponding config file is available while validating config
 * files.
 *
 * This is to ensure consistent error messages that include the relative path to the failing file.
 */
export function validateWithPath<T>({
  config,
  schema,
  path,
  projectRoot,
  name,
  configType,
  ErrorClass,
}: ValidateWithPathParams<T>) {
  const context =
    `${configType} ${name ? `'${name}' ` : ""}` +
    `${path && projectRoot !== path ? "(" + relative(projectRoot, path) + ")" : ""}`

  const validateOpts = {
    context: context.trim(),
  }

  if (ErrorClass) {
    validateOpts["ErrorClass"] = ErrorClass
  }

  return <T>validateSchema(config, schema, validateOpts)
}

export function validateSchema<T>(
  value: T,
  schema: Joi.Schema,
  { context = "", ErrorClass = ConfigurationError }: ValidateOptions = {}
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
          if (d.keys && d.keys[part]) {
            renderedPath += "." + part
            d = d.keys[part]
          } else if (d.patterns) {
            for (const p of d.patterns) {
              if (part.toString().match(new RegExp(p.regex.slice(1, -1)))) {
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
      e.message = e.message.replace(joiLabelPlaceholderRegex, "key " + chalk.underline(renderedPath || "."))
      e.message = e.message.replace(joiPathPlaceholderRegex, chalk.underline(renderedPath || "."))
      // FIXME: remove once we've customized the error output from AJV in customObject.jsonSchema()
      e.message = e.message.replace(/should NOT have/g, "should not have")

      return e
    })

    const msgPrefix = context ? `Error validating ${context}` : "Validation error"
    const errorDescription = errorDetails.map((e) => e.message).join(", ")

    throw new ErrorClass(`${msgPrefix}: ${errorDescription}`, {
      value,
      context,
      errorDescription,
      errorDetails,
    })
  }

  return result.value
}

export interface ArtifactSpec {
  source: string
  target?: string
}
