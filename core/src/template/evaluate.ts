/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deepMap, isArray, isPlainObject } from "../util/objects.js"
import type { EvaluateTemplateArgs, ResolvedTemplate, TemplateEvaluationResult, TemplatePrimitive } from "./types.js"
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

export function deepEvaluate<Input extends ParsedTemplate>(
  collection: Input,
  args: EvaluateTemplateArgs
): Evaluate<Input> {
  return conditionallyDeepEvaluate(collection, args, () => true) as Evaluate<Input>
}

export function conditionallyDeepEvaluate(
  collection: ParsedTemplate,
  args: EvaluateTemplateArgs,
  condition: (v: UnresolvedTemplateValue) => boolean
): ParsedTemplate {
  return deepMap(collection, (v) => {
    if (v instanceof UnresolvedTemplateValue && condition(v)) {
      const evaluated = evaluate(v, args)
      if (evaluated.partial) {
        return conditionallyDeepEvaluate(evaluated.resolved, args, condition)
      }
      return evaluated.resolved
    }
    return v
  })
}

export function evaluate(value: ParsedTemplate, args: EvaluateTemplateArgs): TemplateEvaluationResult {
  if (value instanceof UnresolvedTemplateValue) {
    return value.evaluate(args)
  }

  if (
    isTemplatePrimitive(value) ||
    (isArray(value) && value.length === 0) ||
    (isPlainObject(value) && Object.keys(value).length === 0)
  ) {
    return {
      partial: false,
      // template primitives, empty array or empty object do not need to be resolved
      resolved: value as ResolvedTemplate,
    }
  }

  return {
    partial: true,
    resolved: value,
  }
}
