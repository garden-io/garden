/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CollectionOrValue } from "../util/objects.js"
import { isArray, isPlainObject } from "../util/objects.js"
import { ContextLookupExpression, TemplateExpression } from "./ast.js"
import type { TemplatePrimitive } from "./types.js"
import { parseTemplateString } from "./template-string.js"
import { type ConfigContext } from "../config/template-contexts/base.js"
import { GardenError, InternalError } from "../exceptions.js"
import { type ConfigSource } from "../config/validation.js"

export type TemplateExpressionGenerator = Generator<
  {
    value: TemplatePrimitive | TemplateExpression
    yamlSource: ConfigSource
  },
  void,
  undefined
>

export function* visitAll({
  value,
  parseTemplateStrings = false,
  source,
}: {
  value: CollectionOrValue<TemplatePrimitive | TemplateExpression>
  parseTemplateStrings?: boolean
  source: ConfigSource
}): TemplateExpressionGenerator {
  if (isArray(value)) {
    for (const [k, v] of value.entries()) {
      yield* visitAll({
        value: v,
        parseTemplateStrings,
        source: {
          ...source,
          path: [...source.path, k],
        },
      })
    }
  } else if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      yield* visitAll({
        value: value[k],
        parseTemplateStrings,
        source: {
          ...source,
          path: [...source.path, k],
        },
      })
    }
  } else {
    if (parseTemplateStrings && typeof value === "string") {
      const parsed = parseTemplateString({
        rawTemplateString: value,
        unescape: false,
        source,
      })

      if (typeof parsed === "string") {
        yield {
          value: parsed,
          yamlSource: source,
        }
      } else {
        yield* parsed.visitAll(source)
      }
    } else if (value instanceof TemplateExpression) {
      yield* value.visitAll(source)
    } else {
      yield {
        value,
        yamlSource: source,
      }
    }
  }
}

export class UnresolvableValue {
  constructor(public readonly getError: () => GardenError) {}
}

export function isUnresolvableValue(
  val: CollectionOrValue<TemplatePrimitive | UnresolvableValue>
): val is UnresolvableValue {
  return val instanceof UnresolvableValue
}

export type ContextLookupReferenceFinding =
  | {
      type: "resolvable"
      keyPath: (string | number)[]
      yamlSource: ConfigSource
    }
  | {
      type: "unresolvable"
      keyPath: (string | number | UnresolvableValue)[]
      yamlSource: ConfigSource
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
  for (const { value, yamlSource } of generator) {
    if (value instanceof ContextLookupExpression) {
      let isResolvable: boolean = true
      const keyPath = value.keyPath.map((keyPathExpression) => {
        const key = keyPathExpression.evaluate({
          context,
          opts: { allowPartial: false },
          optional: true,
          yamlSource,
        })
        if (typeof key === "symbol") {
          isResolvable = false
          return new UnresolvableValue(
            captureError(() =>
              // this will throw an error, because the key could not be resolved
              keyPathExpression.evaluate({
                context,
                opts: { allowPartial: false },
                optional: false,
                yamlSource,
              })
            )
          )
        }
        return key
      })

      if (keyPath.length > 0) {
        yield isResolvable
          ? {
              type: "resolvable",
              keyPath: keyPath as (string | number)[],
              yamlSource,
            }
          : {
              type: "unresolvable",
              keyPath,
              yamlSource,
            }
      }
    }
  }
}
