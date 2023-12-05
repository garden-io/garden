/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { cloneDeep, isBoolean, isEmpty } from "lodash-es"
import {
  arrayConcatKey,
  arrayForEachFilterKey,
  arrayForEachKey,
  arrayForEachReturnKey,
  conditionalElseKey,
  conditionalKey,
  conditionalThenKey,
  objectSpreadKey,
} from "../config/constants.js"
import type { ConfigContext, ContextResolveOpts, ObjectPath } from "../config/template-contexts/base.js"
import { GenericContext, renderKeyPath } from "../config/template-contexts/base.js"
import type { Collection, CollectionOrValue } from "../util/objects.js"
import { deepMap, isArray, isPlainObject } from "../util/objects.js"
import { naturalList } from "../util/string.js"
import type { TemplateExpression } from "./ast.js"
import { isTruthy } from "./ast.js"
import type { TemplateLeafValue, TemplatePrimitive, TemplateValue } from "./inputs.js"
import { TemplateLeaf, isTemplateLeaf, mergeInputs } from "./inputs.js"
import type { TemplateProvenance } from "./template-string.js"
import { TemplateError, pushYamlPath } from "./template-string.js"

type UnwrapParams = {
  value: CollectionOrValue<TemplateValue>
  context: ConfigContext
  opts: ContextResolveOpts
}

export function deepUnwrap({ value, context, opts }: UnwrapParams): CollectionOrValue<TemplatePrimitive> {
  return deepMap(value, (v) => {
    if (v instanceof LazyValue) {
      return deepUnwrap({ value: v.evaluate(context, opts), context, opts })
    }

    return v.value
  })
}

export function deepUnwrapLazyValues({ value, context, opts }: UnwrapParams): CollectionOrValue<TemplateLeaf> {
  return deepMap(value, (v) => {
    if (v instanceof LazyValue) {
      return deepUnwrapLazyValues({ value: v.evaluate(context, opts), context, opts })
    }

    return v
  })
}

/**
 * Only unwrap lazy values (calling their evaluate() method), until we encounter either a collection or a TemplateLeaf.
 */
export function unwrapLazyValues({ value, context, opts }: UnwrapParams): TemplateLeaf | Collection<TemplateValue> {
  if (value instanceof LazyValue) {
    // We recursively unwrap, because the value might be a LazyValue<LazyValue<...>>
    // We do not need to worry about infinite recursion here, because it's not possible to declare infinitely recursive structures in garden.yaml configs.
    return unwrapLazyValues({ value: value.evaluate(context, opts), context, opts })
  }

  return value
}

/**
 * Same as unwrapLazyValues, but if encountering a TemplateLeaf, return the leaf's primitive value. Otherwise, return the collection.
 *
 * The result is definitely not a LazyValue or a TemplateLeaf. It's either a TemplatePrimitive or a Collection.
 *
 * This is helpful for making decisions about how to proceed in when evaluating template expressions or block operators.
 */
export function unwrap(params: UnwrapParams): TemplatePrimitive | Collection<TemplateValue> {
  const unwrapped = unwrapLazyValues(params)

  if (unwrapped instanceof TemplateLeaf) {
    return unwrapped.value
  }

  // it's a collection
  return unwrapped
}

export abstract class LazyValue<R extends CollectionOrValue<TemplateValue> = CollectionOrValue<TemplateValue>> {
  private additionalInputs: TemplateLeaf["inputs"] = {}

  public addInputs(inputs: TemplateLeaf["inputs"]) {
    this.additionalInputs = {
      ...this.additionalInputs,
      ...inputs,
    }
  }

  constructor(public readonly source: TemplateProvenance) {}

  abstract evaluate(context: ConfigContext, opts: ContextResolveOpts): R
}

export class MergeInputsLazily extends LazyValue {
  constructor(
    source: TemplateProvenance,
    private readonly value: CollectionOrValue<TemplateValue>,
    private readonly relevantValues: CollectionOrValue<TemplateValue>[]
  ) {
    super(source)
  }

  override evaluate(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue> {
    const unwrapped = unwrapLazyValues({ value: this.value, context, opts })
    return deepMap(unwrapped, (v) => {
      if (v instanceof LazyValue) {
        return new MergeInputsLazily(this.source, v, this.relevantValues)
      }
      return mergeInputs(this.source, v satisfies TemplateLeaf<TemplateLeafValue>, ...this.relevantValues)
    })
  }
}

export class WrapContextLookupInputsLazily extends LazyValue {
  constructor(
    source: TemplateProvenance,
    private readonly value: CollectionOrValue<TemplateValue>,
    private readonly contextKeyPath: ObjectPath,
    private readonly expr: string
  ) {
    super(source)
  }

  override evaluate(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue> {
    const unwrapped = unwrapLazyValues({ value: this.value, context, opts })
    return deepMap(unwrapped, (v, _k, collectionKeyPath) => {
      // Wrap it lazily
      if (v instanceof LazyValue) {
        return new WrapContextLookupInputsLazily(this.source, v, this.contextKeyPath, this.expr)
      }

      return new TemplateLeaf({
        expr: this.expr,
        value: v.value,
        inputs: {
          // key might be something like ["var", "foo", "bar"]
          // We also add the keypath to get separate keys for ever
          [renderKeyPath([...this.contextKeyPath, ...collectionKeyPath])]: v,
        },
      })
    })
  }
}

type TemplateStringLazyValueArgs = {
  source: TemplateProvenance
  astRootNode: TemplateExpression
  expr: string
}
export class TemplateStringLazyValue extends LazyValue {
  private readonly astRootNode: TemplateExpression
  public readonly expr: string

  constructor({ source, expr, astRootNode }: TemplateStringLazyValueArgs) {
    super(source)
    this.expr = expr
    this.astRootNode = astRootNode
  }

  override evaluate(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue> {
    return this.astRootNode.evaluate({ rawTemplateString: this.expr, context, opts })
  }
}

type ConcatOperator = { [arrayConcatKey]: CollectionOrValue<TemplateValue> }
export class ConcatLazyValue extends LazyValue<CollectionOrValue<TemplateValue>[]> {
  constructor(
    source: TemplateProvenance,
    private readonly yaml: (ConcatOperator | CollectionOrValue<TemplateValue>)[]
  ) {
    super(source)
  }

  override evaluate(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue>[] {
    const output: CollectionOrValue<TemplateValue>[] = []

    for (const v of this.yaml) {
      // handle concat operator
      if (isPlainObject(v) && v[arrayConcatKey] !== undefined) {
        if (Object.keys(v).length > 1) {
          const extraKeys = naturalList(
            Object.keys(v)
              .filter((k) => k !== arrayConcatKey)
              .map((k) => JSON.stringify(k))
          )
          throw new TemplateError({
            message: `A list item with a ${arrayConcatKey} key cannot have any other keys (found ${extraKeys})`,
            source: pushYamlPath(arrayConcatKey, this.source),
          })
        }

        const unwrapped = unwrap({ value: v, context, opts })

        if (isArray(v)) {
          output.push(...v)
        } else {
          throw new TemplateError({
            message: `Value of ${arrayConcatKey} key must be (or resolve to) an array (got ${typeof unwrapped})`,
            source: pushYamlPath(arrayConcatKey, this.source),
          })
        }
      } else {
        // it's not a concat operator, it's a list element.
        output.push(v)
      }
    }

    // input tracking is already being taken care of as we just concatenate arrays
    return output
  }
}

type ForEachClause = {
  [arrayForEachKey]: CollectionOrValue<TemplateValue> // must resolve to an array or plain object, but might be a lazy value
  [arrayForEachFilterKey]: CollectionOrValue<TemplateValue> | undefined // must resolve to boolean, but might be lazy value
  [arrayForEachReturnKey]: CollectionOrValue<TemplateValue>
}

export class ForEachLazyValue extends LazyValue<CollectionOrValue<TemplateValue>> {
  static allowedForEachKeys = [arrayForEachKey, arrayForEachReturnKey, arrayForEachFilterKey]
  constructor(
    source: TemplateProvenance,
    private readonly yaml: ForEachClause
  ) {
    super(source)
  }

  override evaluate(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue> {
    // Validate input object
    if (this.yaml[arrayForEachReturnKey] === undefined) {
      throw new TemplateError({
        message: `Missing ${arrayForEachReturnKey} field next to ${arrayForEachKey} field. Got ${naturalList(
          Object.keys(this.yaml)
        )}`,
        source: pushYamlPath(arrayForEachReturnKey, this.source),
      })
    }

    const collectionExpressionValue = unwrapLazyValues({ value: this.yaml[arrayForEachKey], context, opts })

    const isObject = isPlainObject(collectionExpressionValue)

    if (!isArray(collectionExpressionValue) && !isObject) {
      throw new TemplateError({
        message: `Value of ${arrayForEachKey} key must be (or resolve to) an array or mapping object (got ${typeof collectionExpressionValue})`,
        source: pushYamlPath(arrayForEachKey, this.source),
      })
    }

    const filterExpression = this.yaml[arrayForEachFilterKey]

    // TODO: maybe there's a more efficient way to do the cloning/extending?
    const loopContext = cloneDeep(context)

    const output: CollectionOrValue<TemplateValue>[] = []

    for (const i of Object.keys(collectionExpressionValue)) {
      const contextForIndex = new GenericContext({ key: i, value: collectionExpressionValue[i] })
      loopContext["item"] = contextForIndex

      // Have to override the cache in the parent context here
      // TODO: make this a little less hacky :P
      const resolvedValues = loopContext["_resolvedValues"]
      delete resolvedValues["item.key"]
      delete resolvedValues["item.value"]
      const subValues = Object.keys(resolvedValues).filter((k) => k.match(/item\.value\.*/))
      subValues.forEach((v) => delete resolvedValues[v])

      // Check $filter clause output, if applicable
      if (filterExpression !== undefined) {
        const filterResult = unwrapLazyValues({ value: filterExpression, context: loopContext, opts })
        const filterResultValue = unwrap({ value: filterResult, context: loopContext, opts })

        if (isBoolean(filterResultValue) && filterResultValue === false) {
          continue
        } else {
          throw new TemplateError({
            message: `${arrayForEachFilterKey} clause in ${arrayForEachKey} loop must resolve to a boolean value (got ${typeof filterResultValue})`,
            source: pushYamlPath(arrayForEachFilterKey, this.source),
          })
        }
      }

      const returnExpression = this.yaml[arrayForEachReturnKey]

      output.push(unwrapLazyValues({ value: returnExpression, context: loopContext, opts }))
    }

    return output
  }
}

export type ObjectSpreadOperation = {
  [objectSpreadKey]: CollectionOrValue<TemplateValue>
  [staticKeys: string]: CollectionOrValue<TemplateValue>
}
export class ObjectSpreadLazyValue extends LazyValue<Record<string, CollectionOrValue<TemplateValue>>> {
  constructor(
    source: TemplateProvenance,
    private readonly yaml: ObjectSpreadOperation
  ) {
    super(source)
  }

  override evaluate(
    context: ConfigContext,
    opts: ContextResolveOpts
  ): Record<string, CollectionOrValue<TemplateValue>> {
    // Resolve $merge keys, depth-first, leaves-first
    let output = {}

    for (const [k, v] of Object.entries(this.yaml)) {
      const resolved = unwrapLazyValues({ value: v, context, opts })

      if (k === objectSpreadKey) {
        if (isPlainObject(resolved)) {
          output = { ...output, ...resolved }
        } else if (isTemplateLeaf(resolved) && isEmpty(resolved.value)) {
          // nothing to do, we just ignore empty objects
        } else {
          const resolvedValue = unwrap({ value: resolved, context, opts })
          throw new TemplateError({
            message: `Value of ${objectSpreadKey} key must be (or resolve to) a mapping object (got ${typeof resolvedValue})`,
            source: pushYamlPath(k, this.source),
          })
        }
      } else {
        output[k] = resolved
      }
    }

    return output
  }
}

export type ConditionalClause = {
  [conditionalKey]: CollectionOrValue<TemplateValue> // must resolve to a boolean, but might be a lazy value
  [conditionalThenKey]: CollectionOrValue<TemplateValue>
  [conditionalElseKey]?: CollectionOrValue<TemplateValue>
}
export class ConditionalLazyValue extends LazyValue {
  static allowedConditionalKeys = [conditionalKey, conditionalThenKey, conditionalElseKey]

  constructor(
    source: TemplateProvenance,
    private readonly yaml: ConditionalClause
  ) {
    super(source)
  }

  override evaluate(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue> {
    const conditional = this.yaml[conditionalKey]
    const conditionalValue = unwrap({ value: conditional, context, opts })

    if (typeof conditionalValue !== "boolean") {
      throw new TemplateError({
        message: `Value of ${conditionalKey} key must be (or resolve to) a boolean (got ${typeof conditionalValue})`,
        source: pushYamlPath(conditionalKey, this.source),
      })
    }

    const thenClause = this.yaml[conditionalThenKey]

    // We default the $else value to undefined, if it's not specified
    const elseClause =
      this.yaml[conditionalElseKey] === undefined
        ? new TemplateLeaf({
            value: undefined,
            inputs: {},
            expr: conditionalElseKey,
          })
        : this.yaml[conditionalElseKey]

    if (isTruthy(conditionalValue)) {
      return mergeInputs(this.source, thenClause, conditional)
    } else {
      return mergeInputs(this.source, elseClause, conditional)
    }
  }
}
