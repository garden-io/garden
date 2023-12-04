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
import { deepMap } from "../util/objects.js"
import { LazyValue } from "./lazy.js"

export function isTemplateLeafValue(value: unknown): value is TemplateLeafValue {
  return (
    isPrimitive(value) ||
    (isPlainObject(value) && Object.keys(<object>value).length === 0) ||
    (Array.isArray(value) && value.length === 0)
  )
}

export function isTemplatePrimitive(value: unknown): value is TemplatePrimitive {
  return isPrimitive(value) && typeof value !== "symbol"
}

export function templateIsArray<P extends TemplateLeafValue | TemplateLeaf>(
  value: CollectionOrValue<P>
): value is CollectionOrValue<P>[] {
  return Array.isArray(value)
}

export function templateIsObject<P extends TemplateLeafValue | TemplateLeaf>(
  value: CollectionOrValue<P>
): value is { [key: string]: CollectionOrValue<P> } {
  return isPlainObject(value)
}

type EmptyArray = never[]
type EmptyObject = { [key: string]: never }

export type TemplatePrimitive = Exclude<Primitive, symbol>

export type TemplateLeafValue =
  | TemplatePrimitive
  // We need an instance of TemplateValue to wrap /empty/ Arrays and /empty/ Objects, so we can track their inputs.
  // If the array/object has elements, those will be wrapped in TemplateValue instances.
  | EmptyArray
  | EmptyObject

export function isTemplateLeaf(value: unknown): value is TemplateLeaf {
  return value instanceof TemplateLeaf
}

type TemplateInputs = {
  // key is the input variable name, e.g. secrets.someSecret, local.env.SOME_VARIABLE, etc
  [contextKeyPath: string]: TemplateLeaf
}

export class TemplateLeaf<T extends TemplateLeafValue = TemplateLeafValue> {
  public readonly expr: string | undefined
  public readonly value: T
  public readonly inputs: TemplateInputs
  constructor({ expr, value, inputs }: { expr: string | undefined; value: T; inputs: TemplateInputs }) {
    this.expr = expr
    this.value = value
    this.inputs = inputs
  }
}

export type Collection<P extends LazyValue | TemplateLeafValue | TemplateLeaf = TemplateLeaf> =
  | Iterable<CollectionOrValue<P>>
  | { [key: string]: CollectionOrValue<P> }

export type CollectionOrValue<P extends LazyValue | TemplateLeafValue | TemplateLeaf = TemplateLeaf> = P | Collection<P>

// helpers

// Similar to deepMap, but treats empty collections as leaves, because they are template primitives.
export function templatePrimitiveDeepMap<P extends TemplateLeafValue, R extends TemplateLeafValue | TemplateLeaf>(
  value: CollectionOrValue<P>,
  fn: (value: TemplateLeafValue, keyPath: ObjectPath) => CollectionOrValue<R>,
  keyPath: ObjectPath = []
): CollectionOrValue<R> {
  if (isTemplateLeafValue(value)) {
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

export function mergeInputs<R extends TemplateLeafValue>(
  result: CollectionOrValue<TemplateLeaf>,
  ...relevantValues: CollectionOrValue<TemplateLeaf>[]
): CollectionOrValue<TemplateLeaf> {
  let additionalInputs: TemplateLeaf["inputs"] = {}

  const accumulate = (inputs: TemplateLeaf["inputs"]) => {
    additionalInputs = {
      ...additionalInputs,
      ...inputs,
    }
  }

  relevantValues.forEach((r) => {
    if (isTemplateLeaf(r)) {
      accumulate(r.inputs)
    } else {
      deepMap(r, (v: TemplateLeaf, _key, keyPath) => {
        accumulate(v.inputs)
      })
    }
  })

  const updateLeaf = (v: TemplateLeaf<TemplateLeafValue>) => {
    return new TemplateLeaf({
      expr: v.expr,
      value: v.value,
      inputs: {
        ...v.inputs,
        ...additionalInputs,
      },
    })
  }

  return isTemplateLeaf(result)
    ? updateLeaf(result)
    : deepMap(result, (v) => updateLeaf(v))
}
