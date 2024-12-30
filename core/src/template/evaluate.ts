/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { InternalError } from "../exceptions.js"
import { deepMap } from "../util/objects.js"
import type { EvaluateTemplateArgs, ParsedTemplateValue, ResolvedTemplate, TemplatePrimitive } from "./types.js"
import { UnresolvedTemplateValue, type ParsedTemplate } from "./types.js"

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

export function deepEvaluate<Input extends ParsedTemplate>(
  collection: Input,
  args: EvaluateTemplateArgs
): Evaluate<Input> {
  return deepMap(collection, (v) => {
    if (v instanceof UnresolvedTemplateValue) {
      const evaluated = evaluate(v, args)
      return evaluated
    }
    return v
  }) as Evaluate<Input>
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
