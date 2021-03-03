/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray } from "lodash"
import { BaseKeyDescription } from "./common"
import { ValidationError } from "../exceptions"
import { safeDumpYaml } from "../util/util"

export class JsonKeyDescription<T = any> extends BaseKeyDescription<T> {
  private schema: any
  private allowedValues?: string[]

  constructor({
    schema,
    name,
    level,
    parent,
  }: {
    schema: any
    name: string | undefined
    level: number
    parent?: BaseKeyDescription
  }) {
    super(name, level, parent)

    if (isArray(schema.type) && schema.type.includes(null)) {
      this.allowedValues = ["null"]
    }

    this.schema = schema
    this.type = getType(schema)

    if (!this.type) {
      throw new ValidationError(`Missing type property on JSON Schema`, { schema })
    }

    this.allowedValuesOnly = false
    this.deprecated = !!schema.deprecated
    this.description = schema.description
    this.experimental = !!schema["x-garden-experimental"]
    this.internal = !!schema["x-garden-internal"]
    this.required = false

    if (schema.enum) {
      this.allowedValuesOnly = true
      this.allowedValues = [...(this.allowedValues || []), ...schema.enum.map((v: any) => JSON.stringify(v))]
    }

    if (parent?.type === "object" && (<any>this.parent)?.schema?.required?.includes(name)) {
      this.required = true
    }
  }

  formatName() {
    return this.type === "array" ? `${this.name}[]` : this.name
  }

  formatType() {
    return formatType(this.schema)
  }

  formatExample() {
    if (this.schema.examples && this.schema.examples.length > 0) {
      const example = this.schema.examples[0]
      if (this.type === "object" || this.type === "array") {
        return safeDumpYaml(example).trim()
      } else {
        return JSON.stringify(example)
      }
    } else {
      return undefined
    }
  }

  formatAllowedValues() {
    return this.allowedValuesOnly ? this.allowedValues?.join(", ") : undefined
  }

  getDefaultValue() {
    return this.schema.default
  }

  getChildren(renderPatternKeys = false): JsonKeyDescription[] {
    if (this.type === "object") {
      const children = Object.entries(this.schema.properties || {}) || []
      const level = this.name ? this.level + 1 : this.level
      const parent = this.name ? this : this.parent

      const childDescriptions = children.map(
        ([childName, childSchema]) =>
          new JsonKeyDescription({
            schema: childSchema,
            name: childName,
            level,
            parent,
          })
      )
      if (renderPatternKeys && this.schema.patterns && this.schema.patterns.length > 0) {
        // TODO: implement pattern schemas
      }
      return childDescriptions
    } else if (this.type === "array" && this.schema.items[0]) {
      // We only use the first array item
      return [
        new JsonKeyDescription({
          schema: this.schema.items[0],
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

function getType(schema: any): string {
  const { type } = schema

  if (isArray(type)) {
    // TODO: handle multiple type options
    return type.filter((t) => t !== null)[0]
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
