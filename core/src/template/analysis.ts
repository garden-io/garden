/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
import { ParsedTemplateString } from "./templated-strings.js"

export type VisitorFinding = (
  | {
      readonly type: "template-expression"
      readonly value: TemplateExpression
      readonly yamlSource: ConfigSource
      readonly parent: TemplateExpression
      readonly root: TemplateExpression

      /**
       * The consumer of the generator override this if they're not interested in certain children
       */
      childrenEligibleForRecursion?: TemplateExpression[]
    }
  | {
      readonly type: "unresolved-template"
      readonly value: UnresolvedTemplateValue
      readonly yamlSource: undefined

      /**
       * The consumer of the generator override this if they're not interested in certain children
       */
      childrenEligibleForRecursion?: ParsedTemplate[]
    }
) & {
  /**
   * The consumer of the generator may set this to false if they aren't interested in the children of this finding.
   *
   * @default true
   */
  continueRecursion: boolean
}

export type VisitorFindingGenerator = Generator<VisitorFinding, void, undefined>

export type VisitorOpts = {
  /**
   * If true, the returned template expression generator will only yield template expressions that
   * will be evaluated when calling `evaluate`.
   *
   * If `evaluate` returns `partial: true`, and `onlyEssential` is set to true, then the unresolved
   * expressions returned by evaluate will not be emitted by the returned generator.
   *
   * @default false
   */
  readonly onlyEssential: boolean
}
// we need to pass visitor opts recursively, so to ensure that we always do that, the visitor opts are required
export const defaultVisitorOpts: VisitorOpts = {
  onlyEssential: false,
}

export function* visitAll({ value, opts }: { value: ParsedTemplate; opts: VisitorOpts }): VisitorFindingGenerator {
  if (isArray(value)) {
    for (const v of value) {
      yield* visitAll({
        value: v,
        opts,
      })
    }
  } else if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      yield* visitAll({
        value: value[k],
        opts,
      })
    }
  } else if (value instanceof UnresolvedTemplateValue) {
    const finding: VisitorFinding = {
      type: "unresolved-template" as const,
      value,
      yamlSource: undefined,
      continueRecursion: true,
    }
    yield finding
    if (finding.continueRecursion) {
      if (value instanceof ParsedTemplateString) {
        yield* value.visitTemplateExpressions()
      } else {
        // the consumer of this generator may reduce eligible children e.g. to eliminate dead branches.
        // By default visit everything, so we default to all children if the consumer doesn't care.
        const children = finding.childrenEligibleForRecursion || value.getChildren(opts)
        yield* visitAll({ value: children, opts })
      }
    }
  }
}

export function* astVisitAll(
  value: TemplateExpression,
  source: ConfigSource,
  root: TemplateExpression,
  parent: TemplateExpression
): VisitorFindingGenerator {
  const finding: VisitorFinding = {
    type: "template-expression" as const,
    value,
    yamlSource: source,
    root,
    parent,
    continueRecursion: true,
  }
  yield finding
  if (finding.continueRecursion) {
    // the consumer of this generator may reduce eligible children e.g. to eliminate dead branches.
    // By default visit everything, so we default to all children if the consumer doesn't care.
    const children = finding.childrenEligibleForRecursion || value.getChildren()
    for (const item of children) {
      yield* astVisitAll(
        item,
        source,
        root,
        // current value is the new parent
        value
      )
    }
  }
}

export interface Branch<T extends TemplateExpression | ParsedTemplate> {
  /**
   * Returns the children that are in the active part of the branch;
   *
   * If a branch expression is decidable and evaluates to true, returns the "consequent" children
   * If a branch expression is decidable and evaluates to false, returns the "alternate" children
   *
   * If a branch expression is not decidable, all children are considered positive.
   */
  getActiveBranchChildren(context: ConfigContext, opts: ContextResolveOpts, yamlSource: ConfigSource | undefined): T[]
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
  generator: VisitorFindingGenerator,
  context: ConfigContext,
  opts: ContextResolveOpts
): Generator<ContextLookupReferenceFinding, void, undefined> {
  for (const finding of generator) {
    // When encountering branches, we are only interested in recursing into the active part of the branch
    // This makes sure that we ignore references in dead code branches.
    if (finding.value.isBranch()) {
      finding.childrenEligibleForRecursion = finding.value.getActiveBranchChildren(context, opts, finding.yamlSource)
    }

    // we are only interested in template expressions
    if (finding.type !== "template-expression") {
      continue
    }

    const { value, yamlSource, parent, root } = finding

    // we are only interested in ContextLookupExpression instances
    if (!(value instanceof ContextLookupExpression)) {
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
  const generator = getContextLookupReferences(
    visitAll({ value, opts: { ...defaultVisitorOpts, onlyEssential } }),
    context,
    opts
  )

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
  const generator = getContextLookupReferences(
    visitAll({ value, opts: { ...defaultVisitorOpts, onlyEssential } }),
    context,
    opts
  )

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
