/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import set from "lodash-es/set.js"
import { InternalError } from "../exceptions.js"
import { isArray, isPlainObject } from "../util/objects.js"
import { visitAll } from "./analysis.js"
import type { EvaluateTemplateArgs, ParsedTemplateValue, ResolvedTemplate, TemplatePrimitive } from "./types.js"
import { isTemplatePrimitive, UnresolvedTemplateValue, type ParsedTemplate } from "./types.js"

type Evaluate<T extends ParsedTemplate> = T extends UnresolvedTemplateValue
  ? ResolvedTemplate
  : T extends Array<infer V>
    ? V extends ParsedTemplate
      ? Array<Evaluate<V>>
      : ResolvedTemplate
    : T extends { [k: string]: unknown }
      ? { [P in keyof T]: T[P] extends ParsedTemplate ? Evaluate<T[P]> : ResolvedTemplate }
      : T extends TemplatePrimitive
        ? T
        : ResolvedTemplate

type _test1 = Evaluate<{ foo: UnresolvedTemplateValue }>
type _test2 = Evaluate<{ foo: "foo" }>
type _test3 = Evaluate<ParsedTemplate>
export function deepEvaluate<Input extends ParsedTemplate>(
  collection: Input,
  args: EvaluateTemplateArgs
): Evaluate<Input> {
  if (!isArray(collection) && !isPlainObject(collection)) {
    return evaluate(collection, args) as Evaluate<Input>
  }
  const result = isArray(collection) ? [] : {}

  for (const { value, yamlSource } of visitAll({ value: collection, source: { path: [] } })) {
    if (isTemplatePrimitive(value) || value instanceof UnresolvedTemplateValue) {
      const evaluated = evaluate(value, args)
      set(result, yamlSource.path, evaluated)
    }
  }

  return result as Evaluate<Input>
}

export function evaluate<Args extends EvaluateTemplateArgs, Input extends ParsedTemplateValue>(
  value: Input,
  args: Args
): Evaluate<Input> {
  if (!(value instanceof UnresolvedTemplateValue)) {
    return value as Evaluate<Input>
  }

  const result = value.evaluate(args)

  if (typeof result === "symbol") {
    throw new InternalError({
      message: `Evaluation was non-optional, but template expression returned symbol ${String(result)}. ast.ContextLookupExpression should have thrown an error.`,
    })
  }

  return result as Evaluate<Input>
}
