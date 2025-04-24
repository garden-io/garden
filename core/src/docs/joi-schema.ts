/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { uniq, isFunction, extend, isArray, isPlainObject } from "lodash-es"
import { BaseKeyDescription, isArrayType } from "./common.js"
import { findByName } from "../util/util.js"
import { JsonKeyDescription } from "./json-schema.js"
import type { JoiDescription, MetadataKeys } from "../config/common.js"
import { metadataFromDescription } from "../config/common.js"
import { safeDumpYaml } from "../util/serialization.js"
import { zodToJsonSchema } from "zod-to-json-schema"

export class JoiKeyDescription extends BaseKeyDescription {
  private readonly joiDescription: JoiDescription

  override deprecated: boolean
  override deprecationMessage: string | undefined
  override example?: any
  override experimental: boolean
  override required: boolean
  override type: string

  allowedValuesOnly: boolean
  description?: string
  internal: boolean

  constructor({
    joiDescription,
    name,
    level,
    parent,
  }: {
    joiDescription: JoiDescription
    name: string | undefined
    level: number
    parent?: BaseKeyDescription
  }) {
    super(name, level, parent)

    this.joiDescription = joiDescription
    this.name = name
    this.type = joiDescription.type === "customObject" ? "object" : joiDescription.type

    this.allowedValuesOnly = joiDescription.flags?.only === true

    const presenceRequired = joiDescription.flags?.presence === "required"
    this.required = presenceRequired || this.allowedValuesOnly

    const metas: MetadataKeys = extend({}, ...(joiDescription.metas || []))

    this.deprecated = parent?.deprecated || !!metas.deprecated
    if (typeof metas.deprecated === "string") {
      this.deprecationMessage = metas.deprecated
    }
    this.description = joiDescription.flags?.description
    this.experimental = joiDescription.parent?.experimental || !!metas.experimental
    this.internal = parent?.internal || !!metas.internal
  }

  override formatType() {
    return formatType(this.joiDescription)
  }

  override formatName() {
    return isArrayType(this.type) ? `${this.name}[]` : this.name
  }

  formatExample() {
    if (this.joiDescription.examples && this.joiDescription.examples.length) {
      const example = this.joiDescription.examples[0]
      if (isPlainObject(example) || isArray(example)) {
        return safeDumpYaml(example).trim()
      } else {
        return JSON.stringify(example)
      }
    }
    return undefined
  }

  formatAllowedValues() {
    if (this.allowedValuesOnly) {
      return this.joiDescription.allow!.map((v: any) => JSON.stringify(v)).join(", ")
    } else {
      return undefined
    }
  }

  getDefaultValue() {
    const defaultSpec = this.joiDescription.flags?.default
    return isFunction(defaultSpec) ? defaultSpec({}) : defaultSpec
  }

  override formatDefaultValue(): string {
    const meta = metadataFromDescription(this.joiDescription)
    if (meta.isOctal) {
      return `0o${new Number(this.getDefaultValue()).toString(8)}`
    }

    return super.formatDefaultValue()
  }

  getChildren(renderPatternKeys = false) {
    const objSchema = getObjectSchema(this.joiDescription)

    if (objSchema) {
      const children = Object.entries(objSchema.keys || {}) || []
      const nextLevel = this.name ? this.level + 1 : this.level
      const parent = this.name ? this : this.parent

      const childDescriptions: BaseKeyDescription[] = children.map(
        ([childName, childDescription]) =>
          new JoiKeyDescription({
            joiDescription: childDescription as JoiDescription,
            name: childName,
            level: nextLevel,
            parent,
          })
      )

      if (renderPatternKeys && objSchema.patterns && objSchema.patterns.length > 0) {
        const metas: MetadataKeys = extend({}, ...(objSchema.metas || []))
        childDescriptions.push(
          new JoiKeyDescription({
            joiDescription: objSchema.patterns[0].rule as JoiDescription as JoiDescription,
            name: metas.keyPlaceholder || "<name>",
            level: nextLevel,
            parent,
          })
        )
      }

      const jsonSchemaRule = findByName(objSchema.rules || [], "jsonSchema")

      if (jsonSchemaRule) {
        const jsonSchema = jsonSchemaRule.args.jsonSchema.schema

        childDescriptions.push(
          ...Object.entries(jsonSchema.properties || {}).map(
            ([childName, schema]) =>
              new JsonKeyDescription({
                schema,
                name: childName,
                level: nextLevel,
                parent,
              })
          )
        )
      }

      // Convert Zod schema to JSON schema for now
      // TODO: do this more natively and properly
      const zodSchemaRule = findByName(objSchema.rules || [], "zodSchema")

      if (zodSchemaRule) {
        const zodSchema = zodSchemaRule.args.zodSchema
        const jsonSchema = zodToJsonSchema(zodSchema)

        childDescriptions.push(
          ...Object.entries(jsonSchema["properties"] || {}).map(
            ([childName, schema]) =>
              new JsonKeyDescription({
                schema,
                name: childName,
                level: nextLevel,
                parent,
                required: jsonSchema["required"] && jsonSchema["required"].includes(childName),
              })
          )
        )
      }
      return childDescriptions
    } else if (isArrayType(this.joiDescription.type) && this.joiDescription.items[0]) {
      // We only use the first array item
      return [
        new JoiKeyDescription({
          joiDescription: this.joiDescription.items[0],
          name: undefined,
          level: this.level + 2,
          parent: this,
        }),
      ]
    } else {
      return []
    }
  }
}

/**
 * Returns an object schema description if applicable for the field, that is if the provided schema is an
 * object schema _or_ if it's an "alternatives" schema where one alternative is an object schema.
 */
function getObjectSchema(d: JoiDescription): JoiDescription | undefined {
  const { type } = d

  if (type === "alternatives") {
    for (const { schema } of d.matches) {
      const nestedObjSchema = getObjectSchema(schema)
      if (nestedObjSchema && schema.keys) {
        return nestedObjSchema
      }
    }
    return undefined
  } else if (type === "object" || type === "customObject") {
    return d
  } else {
    return undefined
  }
}

function formatType(joiDescription: JoiDescription) {
  const { type } = joiDescription
  const items = isArrayType(type) && joiDescription.items

  if (items && items.length > 0) {
    // We don't consider an array of primitives as children
    const arrayType = items[0].type
    return `array[${arrayType}]`
  } else if (type === "alternatives") {
    // returns e.g. "string \| number". pipe escaped for semantically-correct markdown tables
    return uniq(joiDescription.matches.map(({ schema }) => formatType(schema))).join(" \\| ")
  } else {
    return type || ""
  }
}
