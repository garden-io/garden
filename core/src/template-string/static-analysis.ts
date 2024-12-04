/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CollectionOrValue } from "../util/objects.js"
import { isArray, isPlainObject } from "../util/objects.js"
import {
  ContextLookupExpression,
  TemplateExpression,
} from "./ast.js"
import type { TemplatePrimitive } from "./types.js"
import { parseTemplateString } from "./template-string.js"
import { ConfigContext, CONTEXT_RESOLVE_KEY_AVAILABLE_LATER } from "../config/template-contexts/base.js"
import { GardenError, InternalError } from "../exceptions.js"

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
  for (const finding of getContextLookupReferences(generator, new NoOpContext())) {
    return true
  }

  return false
}

export type ContextLookupReferenceFinding =
  | {
      type: "resolvable"
      keyPath: (string | number)[]
    }
  | {
      type: "unresolvable"
      keyPath: (string | number | { getError: () => GardenError })[]
    }

function captureError(arg: () => void): () => GardenError {
  return () => {
    try {
      arg()
    } catch (e) {
      if (e instanceof GardenError) {
        return e
      }
      throw e
    }
    throw new InternalError({
      message: `captureError: function did not throw: ${arg}`,
    })
  }
}

export function* getContextLookupReferences(
  generator: TemplateExpressionGenerator,
  context: ConfigContext
): Generator<ContextLookupReferenceFinding, void, undefined> {
  for (const expression of generator) {
    if (expression instanceof ContextLookupExpression) {
      let isResolvable: boolean = true
      const keyPath = expression.keyPath.map((keyPathExpression) => {
        const key = keyPathExpression.evaluate({ context, opts: { allowPartial: true } })
        if (typeof key === "symbol") {
          isResolvable = false
          return {
            getError: captureError(() =>
              // this will throw an error, because the key could not be resolved
              keyPathExpression.evaluate({ context, opts: { allowPartial: false } })
            ),
          }
        }
        return key
      })

      if (keyPath.length > 0) {
        yield isResolvable
          ? {
              type: "resolvable",
              keyPath: keyPath as (string | number)[],
            }
          : {
              type: "unresolvable",
              keyPath,
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
