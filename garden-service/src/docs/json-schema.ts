/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten, isArray, uniq } from "lodash"
import { NormalizedSchemaDescription, NormalizeOptions } from "./common"
import { ValidationError } from "../exceptions"
import { safeDumpYaml } from "../util/util"

/**
 * Takes a JSON Schema and translates to a list of NormalizedKeyDescription objects.
 * Analogous to normalizeJoiSchemaDescription(), and flows the same way.
 */
export function normalizeJsonSchema(
  schema: any,
  { level = 0, name, parent, renderPatternKeys = false }: NormalizeOptions = {}
): NormalizedSchemaDescription[] {
  let schemaDescription: NormalizedSchemaDescription | undefined
  let childDescriptions: NormalizedSchemaDescription[] = []

  // Skip descriptions without names since they merely point to the keys we're interested in.
  // This means that we implicitly skip the first key of the schema.
  if (name) {
    schemaDescription = normalizeJsonKeyDescription(schema, { name, level, parent })
  }

  const type = getType(schema)

  if (type === "object") {
    const children = Object.entries(schema.properties || {}) || []
    const nextLevel = name ? level + 1 : level
    const nextParent = name ? schemaDescription : parent

    childDescriptions = flatten(
      children.map(([childName, childSchema]) =>
        normalizeJsonSchema(childSchema, { level: nextLevel, parent: nextParent, name: childName })
      )
    )

    if (renderPatternKeys && schema.patterns && schema.patterns.length > 0) {
      // TODO: implement pattern schemas
    }
  } else if (type === "array") {
    // We only use the first array item
    const item = schema.items[0]
    childDescriptions = item ? normalizeJsonSchema(item, { level: level + 2, parent: schemaDescription }) : []
  }

  if (!schemaDescription) {
    return childDescriptions
  }
  return [schemaDescription, ...childDescriptions].filter((key) => !key.internal)
}

// Normalizes the key description.
// TODO: This no doubt requires more work. Just implementing the bare necessities for our currently configured schemas.
function normalizeJsonKeyDescription(
  schema: any,
  {
    level,
    name,
    parent,
    parentSchema,
  }: { level: number; name: string; parent?: NormalizedSchemaDescription; parentSchema?: any }
): NormalizedSchemaDescription {
  let allowedValues: string[] | undefined

  if (isArray(schema.type) && schema.type.includes(null)) {
    allowedValues = ["null"]
  }

  const type = getType(schema)

  if (!type) {
    throw new ValidationError(`Missing type property on JSON Schema`, { schema })
  }

  const formattedName = type === "array" ? `${name}[]` : name

  let formattedExample: string | undefined
  if (schema.examples && schema.examples.length > 0) {
    const example = schema.examples[0]
    if (type === "object" || type === "array") {
      formattedExample = safeDumpYaml(example).trim()
    } else {
      formattedExample = JSON.stringify(example)
    }
  }

  const output: NormalizedSchemaDescription = {
    type,
    name,
    allowedValuesOnly: false,
    defaultValue: schema.default,
    deprecated: !!schema.deprecated,
    description: schema.description,
    experimental: !!schema["x-garden-experimental"],
    fullKey: parent ? `${parent.fullKey}.${formattedName}` : formattedName,
    formattedExample,
    formattedName,
    formattedType: formatType(schema),
    hasChildren: false,
    internal: !!schema["x-garden-internal"],
    level,
    parent,
    required: false,
  }

  if (schema.enum) {
    output.allowedValuesOnly = true
    allowedValues = [...(allowedValues || []), ...schema.enum.map((v: any) => JSON.stringify(v))]
  }

  if (allowedValues) {
    output.allowedValues = allowedValues?.join(", ")
  }

  if (parent?.type === "object" && parentSchema?.required.includes(name)) {
    output.required = true
  }

  let arrayType: string | undefined

  const children = type === "object" && Object.entries(schema.properties || {})
  const items = type === "array" && schema.items

  if (children && children.length > 0) {
    output.hasChildren = true
  } else if (items && items.length > 0) {
    // We don't consider an array of primitives as children
    arrayType = items[0].type
    output.hasChildren = arrayType === "array" || arrayType === "object"
  }

  return output
}

function getType(schema: any): string {
  const { type, oneOf } = schema

  if (isArray(type)) {
    // TODO: handle multiple type options
    return type.filter((t) => t !== null)[0]
  } else if (oneOf) {
    return uniq(oneOf.map(formatType)).join(" | ")
  } else {
    return type
  }
}

function formatType(schema: any) {
  const type = getType(schema)
  const items = type === "array" && schema.items

  if (items && items.length > 0) {
    const arrayType = items[0].type
    return `array[${arrayType}]`
  } else {
    return type || ""
  }
}
