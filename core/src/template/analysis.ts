/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CollectionOrValue } from "../util/objects.js"
import { isArray, isPlainObject } from "../util/objects.js"
import type { TemplateExpression } from "./ast.js"
import { CONTEXT_RESOLVE_KEY_NOT_FOUND, ContextLookupExpression } from "./ast.js"
import type { ParsedTemplate, TemplatePrimitive } from "./types.js"
import { UnresolvedTemplateValue } from "./types.js"
import type { ContextResolveOpts } from "../config/template-contexts/base.js"
import { type ConfigContext } from "../config/template-contexts/base.js"
import { GardenError, InternalError } from "../exceptions.js"
import { type ConfigSource } from "../config/validation.js"

export type TemplateExpressionGenerator = Generator<
  | {
      type: "template-expression"
      value: TemplateExpression
      yamlSource: ConfigSource
      parent: TemplateExpression
      root: TemplateExpression
    }
  | {
      type: "unresolved-template"
      value: UnresolvedTemplateValue
      yamlSource: undefined
    },
  void,
  undefined
>

export function* visitAll({ value }: { value: ParsedTemplate }): TemplateExpressionGenerator {
  if (isArray(value)) {
    for (const v of value) {
      yield* visitAll({
        value: v,
      })
    }
  } else if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      yield* visitAll({
        value: value[k],
      })
    }
  } else if (value instanceof UnresolvedTemplateValue) {
    yield {
      type: "unresolved-template",
      value,
      yamlSource: undefined,
    }
    yield* value.visitAll({})
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

export type ContextLookupReferenceFinding = (
  | {
      type: "resolvable"
      keyPath: (string | number)[]
    }
  | {
      type: "unresolvable"
      keyPath: (string | number | UnresolvableValue)[]
    }
) & {
  yamlSource: ConfigSource
  parent: TemplateExpression
  root: TemplateExpression
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
  context: ConfigContext,
  opts: ContextResolveOpts
): Generator<ContextLookupReferenceFinding, void, undefined> {
  for (const finding of generator) {
    if (finding.type !== "template-expression") {
      // we are only interested in template expressions here
      continue
    }

    const { value, yamlSource, parent, root } = finding

    if (!(value instanceof ContextLookupExpression)) {
      // we are only interested in ContextLookupExpression instances
      continue
    }

    let isResolvable: boolean = true

    const keyPath = value.keyPath.map((keyPathExpression) => {
      const key = keyPathExpression.evaluate({
        context,
        opts,
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
              opts,
              optional: false,
              yamlSource,
            })
          )
        )
      }

      return key
    })

    const common = {
      yamlSource,
      parent,
      root,
    }
    if (keyPath.length > 0) {
      yield isResolvable
        ? {
            type: "resolvable",
            keyPath: keyPath as (string | number)[],
            ...common,
          }
        : {
            type: "unresolvable",
            keyPath,
            ...common,
          }
    }
  }
}

type ReferenceMatchArgs = {
  value: UnresolvedTemplateValue
  context: ConfigContext
  opts: ContextResolveOpts
  /**
   * If true, the returned template expression generator will only yield template expressions that
   * will be evaluated when calling `evaluate`.
   *
   * If `evaluate` returns `partial: true`, and `onlyEssential` is set to true, then the unresolved
   * expressions returned by evaluate will not be emitted by the returned generator.
   *
   * @default false
   */
  onlyEssential?: boolean
}

export function someReferences({
  value,
  context,
  opts,
  onlyEssential = false,
  matcher,
}: {
  matcher: (ref: ContextLookupReferenceFinding) => boolean
} & ReferenceMatchArgs) {
  const generator = getContextLookupReferences(value.visitAll({ onlyEssential }), context, opts)

  for (const ref of generator) {
    const isMatch = matcher(ref)
    if (isMatch) {
      return true
    }
  }

  return false
}

/**
 * If `onlyEssential: true`, and this function returns `true`, then `evaluate` will not throw an error due to missing context keys.
 * If `onlyEssential: false`, and this function returns `true`, then `deepEvaluate` will not throw an error due to missing context keys.
 */
export function canEvaluateSuccessfully({ value, context, opts, onlyEssential = false }: ReferenceMatchArgs) {
  const generator = getContextLookupReferences(value.visitAll({ onlyEssential }), context, opts)

  // find all essential root expressions containing context lookups
  for (const finding of generator) {
    const essentialExpression = finding.root

    // test if essential expression can be evaluated
    const result = essentialExpression.evaluate({ optional: true, context, opts, yamlSource: finding.yamlSource })

    // the expression might handle the missing key and default to static value
    if (result === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
      // if it resolved to symbol, then evaluation will result in an error with `optional: false`
      return false
    }
  }

  return true
}
