/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isNumber, isString } from "lodash-es"
import type { CollectionOrValue } from "../util/objects.js"
import { isArray, isPlainObject } from "../util/objects.js"
import { ContextLookupExpression, IdentifierExpression, MemberExpression, TemplateExpression } from "./ast.js"
import type { TemplatePrimitive } from "./types.js"
import { parseTemplateString } from "./template-string.js"
import { ConfigContext, CONTEXT_RESOLVE_KEY_AVAILABLE_LATER } from "../config/template-contexts/base.js"

export type TemplateExpressionGenerator = Generator<TemplatePrimitive | TemplateExpression, void, undefined>

export function* visitAll({
  value,
  parseTemplateStrings = false,
}: {
  value: CollectionOrValue<TemplatePrimitive | TemplateExpression>
  parseTemplateStrings?: boolean
}): TemplateExpressionGenerator {
  if (isArray(value)) {
    for (const [_k, v] of value.entries()) {
      yield* visitAll({ value: v, parseTemplateStrings })
    }
  } else if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      yield* visitAll({ value: value[k], parseTemplateStrings })
    }
  } else {
    if (parseTemplateStrings && typeof value === "string") {
      const parsed = parseTemplateString({
        rawTemplateString: value,
        unescape: false,
      })

      if (typeof parsed === "string") {
        yield parsed
      } else {
        yield* parsed.visitAll()
      }
    } else if (value instanceof TemplateExpression) {
      yield* value.visitAll()
    } else {
      yield value
    }
  }
}

export function containsTemplateExpression(generator: TemplateExpressionGenerator): boolean {
  for (const node of generator) {
    if (node instanceof TemplateExpression) {
      return true
    }
  }

  return false
}

export function containsContextLookupReferences(generator: TemplateExpressionGenerator): boolean {
  for (const finding of getContextLookupReferences(generator)) {
    return true
  }

  return false
}

export type ContextLookupReferenceFinding =
  | {
      type: "static"
      keyPath: (string | number)[]
    }
  | {
      type: "dynamic"
      keyPath: (string | number | TemplateExpression)[]
    }
  | {
      type: "invalid"
      keyPath: unknown[]
    }

export function* getContextLookupReferences(
  generator: TemplateExpressionGenerator
): Generator<ContextLookupReferenceFinding, void, undefined> {
  for (const expression of generator) {
    if (expression instanceof ContextLookupExpression) {
      let type: ContextLookupReferenceFinding["type"] | undefined = undefined
      const keyPath: any[] = []

      for (const v of expression.keyPath.values()) {
        if (v instanceof IdentifierExpression) {
          keyPath.push(v.name)
        } else if (v instanceof MemberExpression) {
          if (containsContextLookupReferences(v.innerExpression.visitAll())) {
            // do not override invalid
            if (type !== "invalid") {
              type = "dynamic"
            }
            keyPath.push(v.innerExpression)
          } else {
            // can be evaluated statically
            const result = v.innerExpression.evaluate({
              context: new NoOpContext(),
              rawTemplateString: "",
              opts: {},
            })

            if (isString(result) || isNumber(result)) {
              keyPath.push(result)
              type ||= "static"
            } else {
              keyPath.push(result)
              // if it's invalid, we override to invalid
              type = "invalid"
            }
          }
        } else {
          v satisfies never
        }
      }

      if (type && keyPath.length > 0) {
        yield {
          keyPath,
          type,
        }
      }
    }
  }
}

class NoOpContext extends ConfigContext {
  override resolve() {
    return { resolved: CONTEXT_RESOLVE_KEY_AVAILABLE_LATER, partial: true }
  }
}
