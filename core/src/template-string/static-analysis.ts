/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isNumber, isString, startsWith } from "lodash-es"
import { CollectionOrValue, isArray, isPlainObject } from "../util/objects.js"
import { ContextLookupExpression, IdentifierExpression, LiteralExpression, MemberExpression, TemplateExpression } from "./ast.js"
import { TemplatePrimitive } from "./types.js"

export type TemplateExpressionGenerator = Generator<TemplatePrimitive | TemplateExpression, void, undefined>
export function* visitAll(value: CollectionOrValue<TemplatePrimitive | TemplateExpression>): TemplateExpressionGenerator {
  if (isArray(value)) {
    for (const [k, v] of value.entries()) {
      yield* visitAll(v)
    }
  } else if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      yield* visitAll(value[k])
    }
  } else {
    yield value

    if (value instanceof TemplateExpression) {
      yield* value.visitAll()
    }
  }
}

export function containsTemplateExpression(value: CollectionOrValue<TemplatePrimitive | TemplateExpression>): boolean {
  for (const node of visitAll(value)) {
    if (node instanceof TemplateExpression) {
      return true
    }
  }

  return false
}

export function containsContextLookupReferences(value: CollectionOrValue<TemplatePrimitive | TemplateExpression>, path: (string | number)[]): boolean {
  for (const keyPath of getContextLookupReferences(value)) {
    // TODO: What if the key name contains dots? We should compare arrays instead of comparing joined strings.
    if (startsWith(`${keyPath.join(".")}.`, `${path.join(".")}.`)) {
      return true
    }
  }

  return false
}

export function* getContextLookupReferences(
  value: CollectionOrValue<CollectionOrValue<TemplatePrimitive | TemplateExpression>>
): Generator<(string | number)[], void, undefined> {
  for (const expression of visitAll(value)) {
    if (expression instanceof ContextLookupExpression) {
      const keyPath: (string | number)[] = []

      for (const v of expression.keyPath.values()) {
        if (v instanceof IdentifierExpression) {
          keyPath.push(v.name)
        } else if (v instanceof MemberExpression) {
          if (v.innerExpression instanceof LiteralExpression) {
            if (isString(v.innerExpression.literal) || isNumber(v.innerExpression.literal)) {
              keyPath.push(v.innerExpression.literal)
            } else {
              // only strings and numbers are valid here
              break
            }
          } else {
            // it's a dynamic key, so we can't statically analyse the value
            break
          }
        } else {
          v satisfies never
        }
      }

      if (keyPath.length > 0) {
        yield keyPath
      }
    }
  }
}
