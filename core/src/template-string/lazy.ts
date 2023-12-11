/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { clone, cloneDeep, isBoolean, isEmpty } from "lodash-es"
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
import { isPlainObject, isArray, deepMap } from "../util/objects.js"
import { naturalList } from "../util/string.js"
import type { TemplateExpression } from "./ast.js"
import { isTruthy } from "./ast.js"
import type { TemplateLeafValue, TemplatePrimitive, TemplateValue } from "./inputs.js"
import { TemplateLeaf, isTemplateLeaf, isTemplatePrimitive, mergeInputs } from "./inputs.js"
import type { TemplateProvenance } from "./template-string.js"
import { TemplateError, pushYamlPath } from "./template-string.js"
import { visitAll, type TemplateExpressionGenerator, containsContextLookupReferences } from "./static-analysis.js"
import { InternalError } from "../exceptions.js"

type UnwrapParams = {
  value: CollectionOrValue<TemplateValue>
  context: ConfigContext
  opts: ContextResolveOpts
}

type EvaluatePredicate = (value: LazyValue) => boolean
type ConditionallyEvaluateParams = UnwrapParams & {
  predicate: EvaluatePredicate
}
export function conditionallyEvaluate(params: ConditionallyEvaluateParams): CollectionOrValue<TemplateValue> {
  return deepMap(params.value, (v) => {
    if (v instanceof LazyValue && params.predicate(v)) {
      return conditionallyEvaluate({ ...params, value: v.evaluate(params.context, params.opts) })
    }

    return v
  })
}

export function deepEvaluateAndUnwrap({ value, context, opts }: UnwrapParams): CollectionOrValue<TemplatePrimitive> {
  return deepMap(value, (v) => {
    if (v instanceof LazyValue) {
      return deepEvaluateAndUnwrap({ value: v.evaluate(context, opts), context, opts })
    }

    return v.value
  })
}

export function deepEvaluate({ value, context, opts }: UnwrapParams): CollectionOrValue<TemplateLeaf> {
  return deepMap(value, (v) => {
    if (v instanceof LazyValue) {
      return deepEvaluate({ value: v.evaluate(context, opts), context, opts })
    }

    return v
  })
}

/**
 * Recursively calls .evaluate() method on the lazy value, if value is a lazy value, until it finds a collection or template leaf.
 */
export function evaluate({ value, context, opts }: UnwrapParams): TemplateLeaf | Collection<TemplateValue> {
  if (value instanceof LazyValue) {
    // We recursively unwrap, because the value might be a LazyValue<LazyValue<...>>
    // We do not need to worry about infinite recursion here, because it's not possible to declare infinitely recursive structures in garden.yaml configs.
    return evaluate({ value: value.evaluate(context, opts), context, opts })
  }

  return value
}

/**
 * Same as evaluate, but if encountering a TemplateLeaf, return the leaf's primitive value. Otherwise, return the collection.
 *
 * The result is definitely not a LazyValue or a TemplateLeaf. It's either a TemplatePrimitive or a Collection.
 *
 * This is helpful for making decisions about how to proceed in when evaluating template expressions or block operators.
 */
export function evaluateAndUnwrap(params: UnwrapParams): TemplateLeafValue | Collection<TemplateValue> {
  const evaluated = evaluate(params)

  if (evaluated instanceof TemplateLeaf) {
    return evaluated.value
  }

  // it's a collection
  return evaluated
}

export abstract class LazyValue<R extends CollectionOrValue<TemplateValue> = CollectionOrValue<TemplateValue>> {
  private additionalInputs: TemplateLeaf["inputs"] = {}

  public addInputs(inputs: TemplateLeaf["inputs"]): LazyValue<R> {
    const newLazyValue = clone(this)
    newLazyValue["additionalInputs"] = {
      ...newLazyValue.additionalInputs,
      ...inputs,
    }
    return newLazyValue
  }

  constructor(public readonly source: TemplateProvenance) {}

  public evaluate(context: ConfigContext, opts: ContextResolveOpts): R {
    const result = this.evaluateImpl(context, opts)
    return mergeInputs(
      this.source,
      result,
      // It would be nice if mergeInputs would allow passing `additionalInputs` directly, without wrapping it in `TemplateLeaf`.
      new TemplateLeaf({ expr: undefined, value: undefined, inputs: this.additionalInputs })
    ) as R
  }

  abstract evaluateImpl(context: ConfigContext, opts: ContextResolveOpts): R
  abstract visitAll(): TemplateExpressionGenerator
}

export class OverrideKeyPathLazily extends LazyValue {
  constructor(
    private readonly backingCollection: CollectionOrValue<TemplateValue>,
    private readonly keyPath: ObjectPath,
    private readonly override: CollectionOrValue<TemplateLeaf>
  ) {
    super({ yamlPath: [], source: undefined })
  }

  override *visitAll(): TemplateExpressionGenerator {
    // ???
    yield* visitAll(this.backingCollection)
    yield* visitAll(this.override)
  }

  override evaluateImpl(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue> {
    const evaluated = evaluate({ value: this.backingCollection, context, opts })

    let currentValue = evaluated
    const remainingKeys = clone(this.keyPath.slice(0, -1))
    const targetKey = this.keyPath[this.keyPath.length - 1]

    do {
      const key = remainingKeys.shift()

      if (key === undefined) {
        break
      }

      if (currentValue[key] instanceof LazyValue) {
        currentValue[key] = new OverrideKeyPathLazily(currentValue[key], [...remainingKeys, targetKey], this.override)

        // we don't want to override here, our child instance will do that for us
        return evaluated
      }

      currentValue = currentValue[key]

      if (isTemplateLeaf(currentValue)) {
        if (isArray(currentValue.value) || isPlainObject(currentValue.value)) {
          currentValue = currentValue.value
        } else {
          throw new InternalError({
            message: `Expected a collection or array, got ${typeof currentValue.value}`,
          })
        }
      }
    } while (remainingKeys.length > 0)

    // We arrived at the destination. Override!
    currentValue[targetKey] = this.override

    return evaluated
  }
}

export class MergeInputsLazily extends LazyValue {
  constructor(
    source: TemplateProvenance,
    private readonly value: CollectionOrValue<TemplateValue>,
    private readonly relevantValues: CollectionOrValue<TemplateValue>[]
  ) {
    super(source)
  }

  override *visitAll(): TemplateExpressionGenerator {
    yield* visitAll(this.relevantValues)
    yield* visitAll(this.value)
  }

  override evaluateImpl(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue> {
    const unwrapped = evaluate({ value: this.value, context, opts })
    const unwrappedRelevantValues = this.relevantValues.map((v) => evaluate({ value: v, context, opts }))
    return deepMap(unwrapped, (v) => {
      if (v instanceof LazyValue) {
        return new MergeInputsLazily(this.source, v, unwrappedRelevantValues)
      }
      return mergeInputs(this.source, v satisfies TemplateLeaf<TemplateLeafValue>, ...unwrappedRelevantValues)
    })
  }
}

export class WrapContextLookupInputsLazily extends LazyValue {
  constructor(
    source: TemplateProvenance,
    private readonly value: CollectionOrValue<TemplateValue>,
    private readonly contextKeyPath: ObjectPath,
    private readonly expr: string,
    private readonly collectionKeyPathPrefix: ObjectPath = []
  ) {
    super(source)
  }

  override *visitAll(): TemplateExpressionGenerator {
    yield* visitAll(this.value)
  }

  override evaluateImpl(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue> {
    const unwrapped = evaluate({ value: this.value, context, opts })
    return deepMap(unwrapped, (v, _k, collectionKeyPath) => {
      // Wrap it lazily
      if (v instanceof LazyValue) {
        return new WrapContextLookupInputsLazily(this.source, v, this.contextKeyPath, this.expr, collectionKeyPath)
      }

      return new TemplateLeaf({
        expr: this.expr,
        value: v.value,
        inputs: {
          // key might be something like ["var", "foo", "bar"]
          // We also add the keypath to get separate keys for every level of the keypath
          [renderKeyPath([...this.contextKeyPath, ...this.collectionKeyPathPrefix, ...collectionKeyPath])]: v,
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

  override *visitAll(): TemplateExpressionGenerator {
    yield* this.astRootNode.visitAll()
  }

  override evaluateImpl(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue> {
    return this.astRootNode.evaluate({ rawTemplateString: this.expr, context, opts })
  }
}

type ConcatOperator = { [arrayConcatKey]: CollectionOrValue<TemplateValue> }

export class ConcatLazyValue extends LazyValue<CollectionOrValue<TemplateValue>[]> {
  constructor(
    source: TemplateProvenance,
    private readonly yaml: (ConcatOperator | CollectionOrValue<TemplateValue>)[] | ForEachLazyValue
  ) {
    super(source)
  }

  override *visitAll(): TemplateExpressionGenerator {
    yield* visitAll(this.yaml as CollectionOrValue<TemplateValue>)
  }

  override evaluateImpl(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue>[] {
    const output: CollectionOrValue<TemplateValue>[] = []

    let concatYaml: (ConcatOperator | CollectionOrValue<TemplateValue>)[]
    if (this.yaml instanceof ForEachLazyValue) {
      concatYaml = this.yaml.evaluate(context, opts)
    } else {
      concatYaml = this.yaml
    }

    for (const v of concatYaml) {
      // handle concat operator
      if (this.isConcatOperator(v)) {
        const unwrapped = evaluateAndUnwrap({ value: v[arrayConcatKey], context, opts })

        if (!isTemplatePrimitive(unwrapped) && isArray(unwrapped)) {
          output.push(...unwrapped)
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

  isConcatOperator(v: ConcatOperator | CollectionOrValue<TemplateValue>): v is ConcatOperator {
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
      return true
    }
    return false
  }
}

type ForEachClause = {
  [arrayForEachKey]: CollectionOrValue<TemplateValue> // must resolve to an array or plain object, but might be a lazy value
  [arrayForEachFilterKey]: CollectionOrValue<TemplateValue> | undefined // must resolve to boolean, but might be lazy value
  [arrayForEachReturnKey]: CollectionOrValue<TemplateValue>
}

export class ForEachLazyValue extends LazyValue<CollectionOrValue<TemplateValue>[]> {
  static allowedForEachKeys = [arrayForEachKey, arrayForEachReturnKey, arrayForEachFilterKey]
  constructor(
    source: TemplateProvenance,
    private readonly yaml: ForEachClause
  ) {
    super(source)
  }

  override *visitAll(): TemplateExpressionGenerator {
    yield* visitAll(this.yaml as CollectionOrValue<TemplateValue>)
  }

  override evaluateImpl(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue>[] {
    const collectionExpressionResult = evaluate({ value: this.yaml[arrayForEachKey], context, opts })
    const collectionExpressionValue = evaluateAndUnwrap({ value: collectionExpressionResult, context, opts })

    const isObj = !isTemplatePrimitive(collectionExpressionValue) && isPlainObject(collectionExpressionValue)
    const isArr = !isTemplatePrimitive(collectionExpressionValue) && isArray(collectionExpressionValue)
    if (!isArr && !isObj) {
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
      // put the TemplateValue in the context, not the primitive value, so we have input tracking
      const contextForIndex = new GenericContext({ key: i, value: collectionExpressionResult[i] })
      loopContext["item"] = contextForIndex

      // Have to override the cache in the parent context here
      // TODO: make this a little less hacky :P
      const resolvedValues = loopContext["_resolvedValues"]
      delete resolvedValues["item.key"]
      delete resolvedValues["item.value"]
      const subValues = Object.keys(resolvedValues).filter((k) => k.match(/item\.value\.*/))
      subValues.forEach((v) => delete resolvedValues[v])

      let filterResult: CollectionOrValue<TemplateValue> | undefined
      // Check $filter clause output, if applicable
      if (filterExpression !== undefined) {
        filterResult = evaluate({ value: filterExpression, context: loopContext, opts })
        const filterResultValue = evaluateAndUnwrap({ value: filterResult, context: loopContext, opts })

        if (isBoolean(filterResultValue)) {
          if (!filterResultValue) {
            continue
          }
        } else {
          throw new TemplateError({
            message: `${arrayForEachFilterKey} clause in ${arrayForEachKey} loop must resolve to a boolean value (got ${typeof filterResultValue})`,
            source: pushYamlPath(arrayForEachFilterKey, this.source),
          })
        }
      }

      const returnExpression = this.yaml[arrayForEachReturnKey]

      // we have to eagerly resolve everything that references item, because the variable will not be available in the future anymore.
      const returnResult = conditionallyEvaluate({
        value: returnExpression,
        context: loopContext,
        opts,
        predicate: (v) => containsContextLookupReferences(v, ["item"]),
      })

      if (!containsContextLookupReferences(returnExpression, ["item", "value"])) {
        // force collectionExpressionResult onto the inputs, as the result still depends on the number of elements in the collection expression, even if we do not access item.value
        output.push(
          mergeInputs(this.source, returnResult, collectionExpressionResult[i], ...(filterResult ? [filterResult] : []))
        )
      } else {
        output.push(mergeInputs(this.source, returnResult, ...(filterResult ? [filterResult] : [])))
      }
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

  override *visitAll(): TemplateExpressionGenerator {
    yield* visitAll(this.yaml as CollectionOrValue<TemplateValue>)
  }

  override evaluateImpl(
    context: ConfigContext,
    opts: ContextResolveOpts
  ): Record<string, CollectionOrValue<TemplateValue>> {
    // Resolve $merge keys, depth-first, leaves-first
    let output = {}

    for (const [k, v] of Object.entries(this.yaml)) {
      const resolved = evaluate({ value: v, context, opts })

      if (k === objectSpreadKey) {
        if (isPlainObject(resolved)) {
          output = { ...output, ...resolved }
        } else if (isTemplateLeaf(resolved) && isEmpty(resolved.value)) {
          // nothing to do, we just ignore empty objects
        } else {
          const resolvedValue = evaluateAndUnwrap({ value: resolved, context, opts })
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

  override *visitAll(): TemplateExpressionGenerator {
    yield* visitAll(this.yaml as CollectionOrValue<TemplateValue>)
  }

  override evaluateImpl(context: ConfigContext, opts: ContextResolveOpts): CollectionOrValue<TemplateValue> {
    const conditional = this.yaml[conditionalKey]
    const conditionalValue = evaluateAndUnwrap({ value: conditional, context, opts })

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
