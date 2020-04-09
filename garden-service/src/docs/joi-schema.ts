/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import { flatten, uniq, isFunction, extend } from "lodash"
import { NormalizedSchemaDescription, NormalizeOptions } from "./common"
import { findByName, safeDumpYaml } from "../util/util"
import { normalizeJsonSchema } from "./json-schema"

// Need this to fix the Joi typing
export interface JoiDescription extends Joi.Description {
  name: string
  level: number
  parent?: NormalizedSchemaDescription
  flags?: {
    default?: any
    description?: string
    presence?: string
    only?: boolean
  }
}

// Maps a Joi schema description into an array of descriptions and normalizes each entry.
// Filters out internal descriptions.
export function normalizeJoiSchemaDescription(
  joiDesc: JoiDescription,
  { level = 0, name, parent, renderPatternKeys = false }: NormalizeOptions = {}
): NormalizedSchemaDescription[] {
  let schemaDescription: NormalizedSchemaDescription | undefined
  let childDescriptions: NormalizedSchemaDescription[] = []

  // Skip descriptions without names since they merely point to the keys we're interested in.
  // This means that we implicitly skip the first key of the schema.
  if (name) {
    schemaDescription = normalizeJoiKeyDescription({ ...joiDesc, name, level, parent })
  }

  if (joiDesc.type === "object" || joiDesc.type === "customObject") {
    const children = Object.entries(joiDesc.keys || {}) || []
    const nextLevel = name ? level + 1 : level
    const nextParent = name ? schemaDescription : parent

    childDescriptions = flatten(
      children.map(([childName, childDescription]) =>
        normalizeJoiSchemaDescription(childDescription as JoiDescription, {
          level: nextLevel,
          parent: nextParent,
          name: childName,
        })
      )
    )

    if (renderPatternKeys && joiDesc.patterns && joiDesc.patterns.length > 0) {
      const metas: any = extend({}, ...(joiDesc.metas || []))
      childDescriptions.push(
        ...normalizeJoiSchemaDescription(joiDesc.patterns[0].rule as JoiDescription, {
          level: nextLevel,
          parent: nextParent,
          name: metas.keyPlaceholder || "<name>",
        })
      )
    }

    const jsonSchemaRule = findByName(joiDesc.rules || [], "jsonSchema")

    if (jsonSchemaRule) {
      const jsonSchema = jsonSchemaRule.args.jsonSchema.schema

      childDescriptions.push(
        ...flatten(
          Object.entries(jsonSchema.properties).map(([childName, childDescription]) =>
            normalizeJsonSchema(childDescription as JoiDescription, {
              level: nextLevel,
              parent: nextParent,
              name: childName,
            })
          )
        )
      )
    }
  } else if (joiDesc.type === "array") {
    // We only use the first array item
    const item = joiDesc.items[0]
    childDescriptions = item ? normalizeJoiSchemaDescription(item, { level: level + 2, parent: schemaDescription }) : []
  }

  if (!schemaDescription) {
    return childDescriptions
  }
  return [schemaDescription, ...childDescriptions].filter((key) => !key.internal)
}

// Normalizes the key description
function normalizeJoiKeyDescription(schemaDescription: JoiDescription): NormalizedSchemaDescription {
  const defaultValue = getJoiDefaultValue(schemaDescription)

  let allowedValues: string | undefined = undefined
  const allowOnly = schemaDescription.flags?.only === true
  if (allowOnly) {
    allowedValues = schemaDescription.allow!.map((v: any) => JSON.stringify(v)).join(", ")
  }

  const presenceRequired = schemaDescription.flags?.presence === "required"
  const required = presenceRequired || allowOnly

  let hasChildren: boolean = false
  let arrayType: string | undefined
  const { type } = schemaDescription
  const formattedType = formatType(schemaDescription)

  const children = type === "object" && Object.entries(schemaDescription.keys || {})
  const items = type === "array" && schemaDescription.items

  if (children && children.length > 0) {
    hasChildren = true
  } else if (items && items.length > 0) {
    // We don't consider an array of primitives as children
    arrayType = items[0].type
    hasChildren = arrayType === "array" || arrayType === "object"
  }

  let formattedExample: string | undefined
  if (schemaDescription.examples && schemaDescription.examples.length) {
    const example = schemaDescription.examples[0]
    if (schemaDescription.type === "object" || schemaDescription.type === "array") {
      formattedExample = safeDumpYaml(example).trim()
    } else {
      formattedExample = JSON.stringify(example)
    }
  }

  const metas: any = extend({}, ...(schemaDescription.metas || []))
  const formattedName = type === "array" ? `${schemaDescription.name}[]` : schemaDescription.name

  const fullKey = schemaDescription.parent ? `${schemaDescription.parent.fullKey}.${formattedName}` : formattedName

  return {
    type: type!,
    name: schemaDescription.name,
    allowedValues,
    allowedValuesOnly: !!schemaDescription.flags?.only,
    defaultValue,
    deprecated: schemaDescription.parent?.deprecated || !!metas.deprecated,
    description: schemaDescription.flags?.description,
    experimental: schemaDescription.parent?.experimental || !!metas.experimental,
    fullKey,
    formattedExample,
    formattedName,
    formattedType,
    hasChildren,
    internal: schemaDescription.parent?.internal || !!metas.internal,
    level: schemaDescription.level,
    parent: schemaDescription.parent,
    required,
  }
}

export function getJoiDefaultValue(schemaDescription: JoiDescription) {
  const flags: any = schemaDescription.flags
  const defaultSpec = flags?.default
  return isFunction(defaultSpec) ? defaultSpec(schemaDescription.parent) : defaultSpec
}

function formatType(description: JoiDescription) {
  const { type } = description
  const items = type === "array" && description.items

  if (items && items.length > 0) {
    // We don't consider an array of primitives as children
    const arrayType = items[0].type
    return `array[${arrayType}]`
  } else if (type === "alternatives") {
    // returns e.g. "string|number"
    return uniq(description.matches.map(({ schema }) => formatType(schema))).join(" | ")
  } else {
    return type || ""
  }
}
