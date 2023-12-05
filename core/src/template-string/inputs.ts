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
import { CollectionOrValue, deepMap } from "../util/objects.js"
import { LazyValue, MergeInputsLazily, deepUnwrapLazyValues, unwrap, unwrapLazyValues } from "./lazy.js"

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

export type TemplateInputs = {
  // key is the input variable name, e.g. secrets.someSecret, local.env.SOME_VARIABLE, etc
  [contextKeyPath: string]: TemplateLeaf
}

export class TemplateLeaf<T extends TemplateLeafValue = TemplateLeafValue> {
  public readonly expr: string | undefined
  public readonly value: T
  private _inputs: TemplateInputs

  constructor({ expr, value, inputs }: { expr: string | undefined; value: T; inputs: TemplateInputs }) {
    this.expr = expr
    this.value = value
    this._inputs = inputs
  }

  public get inputs(): TemplateInputs {
    return this._inputs
  }

  public addInputs(additionalInputs: TemplateLeaf["inputs"]) {
    this._inputs = {
      ...this.inputs,
      ...additionalInputs,
    }
  }
}

export type TemplateValue = TemplateLeaf | LazyValue

// helpers

// Similar to deepMap, but treats empty collections as leaves, because they are template primitives.
export function templatePrimitiveDeepMap<P extends TemplateLeafValue, R extends TemplateLeafValue | TemplateValue>(
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

export function mergeInputs(
  result: CollectionOrValue<TemplateValue>,
  ...relevantValues: CollectionOrValue<TemplateValue>[]
): CollectionOrValue<TemplateValue> {
  let additionalInputs: TemplateLeaf["inputs"] = {}

  const accumulate = (inputs: TemplateLeaf["inputs"]) => {
    additionalInputs = {
      ...additionalInputs,
      ...inputs,
    }
  }

  for (const v of relevantValues) {
    let hasLazyValues = false

    deepMap(v, (leaf) => {
      if (leaf instanceof LazyValue) {
        hasLazyValues = true
      } else {
        accumulate(leaf.inputs)
      }
    })

    if (hasLazyValues) {
      return new MergeInputsLazily(result, relevantValues)
    }
  }

  return deepMap(result, (v) => {
    v.addInputs(additionalInputs)
    return v
  })
}
