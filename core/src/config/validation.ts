/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { ConfigurationError } from "../exceptions.js"
import { relative } from "path"
import { uuidv4 } from "../util/random.js"
import type { BaseGardenResource, ObjectPath, YamlDocumentWithSource } from "./base.js"
import type { ParsedNode } from "yaml"
import { padEnd } from "lodash-es"
import { styles } from "../logger/styles.js"

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
    "any.required": `{{#label}} is required at path ${joiPathPlaceholder}`,
    "object.missing": `object at ${joiPathPlaceholder} must contain at least one of {{#peersWithLabels}}`,
    "object.nand": `{{#mainWithLabel}} can\'t be specified simultaneously with {{#peersWithLabels}}`,
    "object.unknown": `key "{{#child}}" is not allowed at path ${joiPathPlaceholder}`,
    "object.with": `"{{#mainWithLabel}}" must be specified with "{{#peerWithLabel}}"`,
    "object.without": `"{{#mainWithLabel}}" can\'t be specified with "{{#peerWithLabel}}"`,
    "object.xor": `object at ${joiPathPlaceholder} can only contain one of {{#peersWithLabels}}`,
  },
  errors: errorPrefs,
}

export interface ConfigSource {
  path: ObjectPath
  yamlDoc?: YamlDocumentWithSource
}

export interface ValidateOptions {
  context?: string // Descriptive text to include in validation error messages, e.g. "module at some/local/path"
  ErrorClass?: typeof ConfigurationError
  source?: ConfigSource
  docsUrl?: string
}

export interface ValidateWithPathParams {
  config: unknown
  schema: Joi.Schema
  path: string // Absolute path to the config file, including filename
  projectRoot: string
  name?: string // Name of the top-level entity that the config belongs to, e.g. "some-module" or "some-project"
  configType: string // The type of top-level entity that the config belongs to, e.g. "module" or "project"
  source: ConfigSource | undefined
  ErrorClass?: typeof ConfigurationError
  docsUrl?: string
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
  source,
  docsUrl,
}: ValidateWithPathParams) {
  const context =
    `${configType} ${name ? `'${name}' ` : ""}` +
    `${path && projectRoot !== path ? "(" + relative(projectRoot, path) + ")" : ""}`

  const validateOpts = {
    context: context.trim(),
    source,
    docsUrl,
  }

  if (ErrorClass) {
    validateOpts["ErrorClass"] = ErrorClass
  }

  return <T>validateSchema(config, schema, validateOpts)
}

export interface ValidateConfigParams {
  config: BaseGardenResource
  schema: Joi.Schema
  projectRoot: string
  yamlDocBasePath: ObjectPath
  ErrorClass?: typeof ConfigurationError
}

export function validateConfig<T extends BaseGardenResource>(params: ValidateConfigParams): T {
  const { config, schema, projectRoot, ErrorClass, yamlDocBasePath } = params

  const { name, kind } = config
  const path = config.internal.configFilePath || config.internal.basePath

  const context =
    `${kind} ${name ? `'${name}' ` : ""}` +
    `${path && projectRoot !== path ? "(" + relative(projectRoot, path) + ")" : ""}`

  return <T>validateSchema(config, schema, {
    context: context.trim(),
    source: config.internal.yamlDoc ? { yamlDoc: config.internal.yamlDoc, path: yamlDocBasePath } : undefined,
    ErrorClass,
  })
}

export function validateSchema<T>(
  value: unknown,
  schema: Joi.Schema,
  { source, context = "", ErrorClass = ConfigurationError, docsUrl }: ValidateOptions = {}
): T {
  const result = schema.validate(value, joiOptions)
  const error = result.error

  if (!error) {
    return result.value
  }

  const yamlBasePath = source?.path || []

  const errorDetails = error.details.map((e) => {
    e.message =
      e.type === "zodValidation"
        ? improveZodValidationErrorMessage(e, yamlBasePath)
        : improveJoiValidationErrorMessage(e, schema, yamlBasePath)

    try {
      e.message = addYamlContext({
        source: {
          ...source,
          path: [...yamlBasePath, ...e.path],
        },
        message: e.message,
      })
    } catch {
      // ignore
    }

    return e
  })

  const msgPrefix = context ? `Error validating ${context}` : "Validation error"
  let errorDescription = errorDetails.map((e) => e.message).join("\n")

  const schemaDescription = schema.describe()

  if (schemaDescription.keys && errorDescription.includes("is not allowed at path")) {
    // Not the case e.g. for array schemas
    errorDescription += `. Available keys: ${Object.keys(schema.describe().keys).join(", ")})`
  }

  if (docsUrl) {
    errorDescription += `\n\nFor more information, see ${docsUrl}`
  }

  throw new ErrorClass({
    message: `${msgPrefix}:\n\n${errorDescription}`,
  })
}

export interface ArtifactSpec {
  source: string
  target: string
}

function improveJoiValidationErrorMessage(item: Joi.ValidationErrorItem, schema: Joi.Schema, yamlBasePath: ObjectPath) {
  // render the key path in a much nicer way
  const description = schema.describe()
  let renderedPath = yamlBasePath.join(".")
  let msg = item.message
  if (item.path.length) {
    let d = description

    for (const part of item.path) {
      if (d.keys && d.keys[part]) {
        renderedPath = renderedPath ? renderedPath + "." + part : part.toString()
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
  msg = msg.replace(joiLabelPlaceholderRegex, renderedPath ? styles.bold.underline(renderedPath) : "value")
  msg = msg.replace(joiPathPlaceholderRegex, styles.bold.underline(renderedPath || "."))
  // FIXME: remove once we've customized the error output from AJV in customObject.jsonSchema()
  msg = msg.replace(/should NOT have/g, "should not have")

  return msg
}

function improveZodValidationErrorMessage(item: Joi.ValidationErrorItem, yamlBasePath: ObjectPath) {
  const path = [...yamlBasePath, ...item.path].join(".")
  if (path.length > 0) {
    return `At path ${styles.primary(path)}: ${item.message}`
  } else {
    return item.message
  }
}

export function getYamlContext(source: ConfigSource): string | undefined {
  const { yamlDoc, path } = source
  if (!yamlDoc) {
    return undefined
  }

  const node = yamlDoc.getIn(path, true) as ParsedNode | undefined
  const range = node?.range
  const rawYaml = yamlDoc.source

  if (!node || !range || !rawYaml) {
    return undefined
  }

  try {
    // Get one line before the error location start, and the line including the error location end
    const toStart = rawYaml.slice(0, range[0])
    const lineNumber = toStart.split("\n").length + 1
    let snippetLines = 1

    const errorLineStart = toStart.lastIndexOf("\n") + 1

    let snippetStart = errorLineStart
    if (snippetStart > 0) {
      snippetStart = rawYaml.slice(0, snippetStart - 1).lastIndexOf("\n") + 1
    }
    if (snippetStart === 0) {
      snippetStart = errorLineStart
    } else {
      snippetLines++
    }

    const snippetEnd = rawYaml.indexOf("\n", range[1] - 1) || rawYaml.length

    const linePrefixLength = lineNumber.toString().length + 2
    let snippet = rawYaml
      .slice(snippetStart, snippetEnd)
      .trimEnd()
      .split("\n")
      .map(
        (l, i) =>
          styles.primary(padEnd("" + (lineNumber - snippetLines + i), linePrefixLength) + "| ") + styles.highlight(l)
      )
      .join("\n")

    if (snippetStart > 0) {
      snippet = styles.primary("...\n") + snippet
    }

    const errorLineOffset = range[0] - errorLineStart + linePrefixLength + 2
    const marker = styles.error("-".repeat(errorLineOffset)) + styles.error.bold("^")

    return `${yamlDoc.filename ? `${styles.secondary(`${yamlDoc.filename}:${lineNumber - (snippetLines - 1)}`)}\n` : ""}${snippet}\n${marker}`
  } catch {
    // ignore
  }

  return undefined
}

export function addYamlContext({ source, message }: { source: ConfigSource; message: string }): string {
  const yamlContext = getYamlContext(source)
  if (!yamlContext) {
    return message
  }

  return `${yamlContext}\n${styles.error.bold(message)}`
}
