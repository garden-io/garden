/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Primitive, isPrimitive } from "utility-types"
import { ObjectPath } from "../config/template-contexts/base.js"
import { InternalError } from "../exceptions.js"
import { isArray, isPlainObject, mapValues } from "lodash-es"

export function isTemplatePrimitive(value: unknown): value is TemplatePrimitive {
  return (
    isPrimitive(value) ||
    (isPlainObject(value) && Object.keys(<object>value).length === 0) ||
    (Array.isArray(value) && value.length === 0)
  )
}

export function templateIsArray<P extends (TemplatePrimitive | TemplateValue)>(value: CollectionOrValue<P>): value is (CollectionOrValue<P>)[] {
  return Array.isArray(value)
}

export function templateIsObject<P extends (TemplatePrimitive | TemplateValue)>(value: CollectionOrValue<P>): value is ({ [key: string]: CollectionOrValue<P> }) {
  return isPlainObject(value)
}

type EmptyArray = never[]
type EmptyObject = { [key: string]: never }

export type TemplatePrimitive =
  | Primitive
  // We need an instance of TemplateValue to wrap /empty/ Arrays and /empty/ Objects, so we can track their inputs.
  // If the array/object has elements, those will be wrapped in TemplateValue instances.
  | EmptyArray
  | EmptyObject

export function isTemplateValue(value: unknown): value is TemplateValue {
  return value instanceof TemplateValue
}

type TemplateInputs = {
  // key is the input variable name, e.g. secrets.someSecret, local.env.SOME_VARIABLE, etc
  [contextKeyPath: string]: TemplateValue
}

export class TemplateValue<T extends TemplatePrimitive = TemplatePrimitive> {
  public readonly expr: string | undefined
  public readonly value: T
  public readonly inputs: TemplateInputs
  constructor({ expr, value, inputs }: { expr: string | undefined; value: T; inputs: TemplateInputs }) {
    this.expr = expr
    this.value = value
    this.inputs = inputs
  }
}

export type CollectionOrValue<P extends TemplatePrimitive | TemplateValue = TemplateValue> =
  | P
  | Iterable<CollectionOrValue<P>>
  | { [key: string]: CollectionOrValue<P> }

// helpers

// Similar to deepMap, but treats empty collections as leaves, because they are template primitives.
export function templatePrimitiveDeepMap<P extends TemplatePrimitive, R extends TemplatePrimitive | TemplateValue>(
  value: CollectionOrValue<P>,
  fn: (value: TemplatePrimitive, keyPath: ObjectPath) => CollectionOrValue<R>,
  keyPath: ObjectPath = []
): CollectionOrValue<R> {
  if (isTemplatePrimitive(value)) {
    // This also handles empty collections
    return fn(value, keyPath)
  } else if (isArray(value)) {
    return value.map((v, k) => templatePrimitiveDeepMap(v, fn, [...keyPath, k]))
  } else if (isPlainObject(value)) {
    // we know we can use mapValues, as this was a plain object
    return mapValues(value as any, (v, k) => templatePrimitiveDeepMap(v, fn, [...keyPath, k]))
  } else {
    throw new InternalError({ message: `Unexpected value type: ${typeof value}` })
  }
}
