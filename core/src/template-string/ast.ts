/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray, isEmpty, isNumber, isString } from "lodash-es"
import { type ConfigContext, type ContextResolveOpts } from "../config/template-contexts/base.js"
import { GardenError, InternalError, TemplateStringError } from "../exceptions.js"
import { getHelperFunctions } from "./functions.js"
import {
  TemplateLeaf,
  isTemplateLeaf,
  isTemplateLeafValue,
  isTemplatePrimitive,
  mergeInputs,
  templatePrimitiveDeepMap,
} from "./inputs.js"
import type { TemplateLeafValue, TemplatePrimitive, TemplateValue } from "./inputs.js"
import { WrapContextLookupInputsLazily, deepEvaluateAndUnwrap, evaluateAndUnwrap, evaluate } from "./lazy.js"
import { Collection, CollectionOrValue, deepMap } from "../util/objects.js"
import { TemplateProvenance } from "./template-string.js"
import { validateSchema } from "../config/validation.js"
import { TemplateExpressionGenerator, containsLazyValues } from "./static-analysis.js"

type EvaluateArgs = {
  context: ConfigContext
  opts: ContextResolveOpts
  rawTemplateString: string

  /**
   * Whether or not to throw an error if ContextLookupExpression fails to resolve variable.
   * The FormatStringExpression will set this parameter based on wether the OptionalSuffix (?) is present or not.
   */
  optional?: boolean
}

/**
 * Returned by the `location()` helper in PEG.js.
 */
export type Location = {
  start: {
    offset: number
    line: number
    column: number
  }
  end: {
    offset: number
    line: number
    column: number
  }
  source: TemplateProvenance
}

function* astVisitAll(e: TemplateExpression): TemplateExpressionGenerator {
  for (const propertyValue of Object.values(e)) {
    if (propertyValue instanceof TemplateExpression) {
      yield propertyValue
      yield* astVisitAll(propertyValue)
    } else if (Array.isArray(propertyValue)) {
      for (const item of propertyValue) {
        if (item instanceof TemplateExpression) {
          yield item
          yield* astVisitAll(item)
        }
      }
    }
  }
}

export abstract class TemplateExpression {
  constructor(public readonly loc: Location) {}

  *visitAll(): TemplateExpressionGenerator {
    yield* astVisitAll(this)
  }

  abstract evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue>
}

export class IdentifierExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly name: string
  ) {
    if (!isString(name)) {
      throw new InternalError({
        message: `IdentifierExpression name must be a string. Got: ${typeof name}`,
      })
    }
    super(loc)
  }

  override evaluate({ rawTemplateString }): TemplateLeaf<string> {
    return new TemplateLeaf({
      expr: rawTemplateString,
      value: this.name,
      inputs: {},
    })
  }
}

export class LiteralExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly literal: TemplatePrimitive
  ) {
    super(loc)
  }

  override evaluate(args: EvaluateArgs): TemplateLeaf<TemplatePrimitive> {
    return new TemplateLeaf({
      expr: args.rawTemplateString,
      value: this.literal,
      inputs: {},
    })
  }
}

export class ArrayLiteralExpression extends TemplateExpression {
  constructor(
    loc: Location,
    // an ArrayLiteralExpression consists of several template expressions,
    // for example other literal expressions and context lookup expressions.
    public readonly literal: TemplateExpression[]
  ) {
    super(loc)
  }

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    // Empty array needs to be wrapped with TemplateLeaf
    if (isEmpty(this.literal)) {
      return new TemplateLeaf({
        expr: args.rawTemplateString,
        value: [],
        inputs: {},
      })
    }

    return this.literal.map((expr) => expr.evaluate(args))
  }
}

export abstract class UnaryExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly innerExpression: TemplateExpression
  ) {
    super(loc)
  }

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const inner = this.innerExpression.evaluate(args)

    const innerValue = evaluateAndUnwrap({ value: inner, context: args.context, opts: args.opts })

    return mergeInputs(
      this.loc.source,
      new TemplateLeaf({
        expr: args.rawTemplateString,
        value: this.transform(innerValue),
        inputs: {},
      }),
      inner
    )
  }

  abstract transform(value: TemplatePrimitive | Collection<TemplateValue>): TemplatePrimitive
}

export class TypeofExpression extends UnaryExpression {
  override transform(value: TemplatePrimitive | Collection<TemplateValue>): string {
    return typeof value
  }
}

export class NotExpression extends UnaryExpression {
  override transform(value: TemplatePrimitive | Collection<TemplateValue>): boolean {
    return !value
  }
}

export abstract class LogicalExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly operator: string,
    public readonly left: TemplateExpression,
    public readonly right: TemplateExpression
  ) {
    super(loc)
  }
}

// you need to call with unwrap: isTruthy(unwrap(value))
export function isTruthy(v: TemplatePrimitive | Collection<TemplateValue>): boolean {
  if (isTemplatePrimitive(v)) {
    return !!v
  } else {
    // collections are truthy, regardless wether they are empty or not.
    v satisfies Collection<TemplateValue>
    return true
  }
}

export class LogicalOrExpression extends LogicalExpression {
  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const left = this.left.evaluate({
      ...args,
      optional: true,
    })

    if (isTruthy(evaluateAndUnwrap({ value: left, context: args.context, opts: args.opts }))) {
      return left
    }

    if (args.opts.allowPartial) {
      // it might be that the left side will become resolvable later.
      // TODO: should we maybe explicitly return a symbol, when we couldn't resolve something?
      return mergeInputs(this.loc.source, new TemplateLeaf({
        expr: args.rawTemplateString,
        value: undefined,
        inputs: {},
      }), left)
    }

    const right = this.right.evaluate(args)
    return mergeInputs(this.loc.source, right, left)
  }
}

export class LogicalAndExpression extends LogicalExpression {
  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const left = this.left.evaluate({
      ...args,
      // TODO: Why optional for &&?
      optional: true,
    })

    // NOTE(steffen): I find this logic extremely weird.
    //
    // I would have expected the following:
    // "value" && missing => error
    // missing && "value" => error
    // false && missing => false
    //
    // and similarly for ||:
    // missing || "value" => "value"
    // "value" || missing => "value"
    // missing || missing => error
    // false || missing => error

    const leftValue = evaluateAndUnwrap({ value: left, context: args.context, opts: args.opts })
    if (!isTruthy(leftValue)) {
      // Javascript would return the value on the left; we return false in case the value is undefined. This is a quirk of Garden's template languate that we want to keep for backwards compatibility.
      if (leftValue === undefined) {
        return mergeInputs(
          this.loc.source,
          new TemplateLeaf({
            expr: args.rawTemplateString,
            value: args.opts.allowPartial ? undefined : false,
            inputs: {},
          }),
          left
        )
      } else {
        return left
      }
    } else {
      const right = this.right.evaluate({
        ...args,
        // TODO: is this right?
        optional: true,
      })
      const rightValue = evaluateAndUnwrap({ value: right, context: args.context, opts: args.opts })
      if (rightValue === undefined) {
        return mergeInputs(
          this.loc.source,
          new TemplateLeaf({
            expr: args.rawTemplateString,
            value: args.opts.allowPartial ? undefined : false,
            inputs: {},
          }),
          right,
          left
        )
      } else {
        return mergeInputs(this.loc.source, right, left)
      }
    }
  }
}

export abstract class BinaryExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly operator: string,
    public readonly left: TemplateExpression,
    public readonly right: TemplateExpression
  ) {
    super(loc)
  }

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const left = this.left.evaluate(args)
    const right = this.right.evaluate(args)

    const leftValue = evaluateAndUnwrap({ value: left, context: args.context, opts: args.opts })
    const rightValue = evaluateAndUnwrap({ value: right, context: args.context, opts: args.opts })

    const transformed = this.transform(leftValue, rightValue, args)

    if (isTemplatePrimitive(transformed)) {
      return mergeInputs(
        this.loc.source,
        new TemplateLeaf({
          expr: args.rawTemplateString,
          value: transformed,
          inputs: {},
        }),
        left,
        right
      )
    }

    // We don't need to merge inputs; if transform returns a collection it took care of that already.
    // Example: concatenation of strings with the + operator.
    return transformed
  }

  abstract transform(
    left: TemplatePrimitive | Collection<TemplateValue>,
    right: TemplatePrimitive | Collection<TemplateValue>,
    args: EvaluateArgs
  ): TemplatePrimitive | Collection<TemplateValue>
}

export class EqualExpression extends BinaryExpression {
  override transform(
    left: TemplatePrimitive | Collection<TemplateValue>,
    right: TemplatePrimitive | Collection<TemplateValue>
  ): boolean {
    return left === right
  }
}

export class NotEqualExpression extends BinaryExpression {
  override transform(
    left: TemplatePrimitive | Collection<TemplateValue>,
    right: TemplatePrimitive | Collection<TemplateValue>
  ): boolean {
    return left !== right
  }
}

export class AddExpression extends BinaryExpression {
  override transform(
    left: TemplatePrimitive | Collection<TemplateValue>,
    right: TemplatePrimitive | Collection<TemplateValue>,
    args: EvaluateArgs
  ): TemplatePrimitive | Collection<TemplateValue> {
    if (isNumber(left) && isNumber(right)) {
      return left + right
    } else if (isString(left) && isString(left)) {
      return left + right
    } else if (Array.isArray(left) && Array.isArray(right)) {
      // In this special case, simply return the concatenated arrays.
      // Input tracking has been taken care of already in this case, as leaf objects are preserved.
      return left.concat(right)
    } else {
      throw new TemplateStringError({
        message: `Both terms need to be either arrays or strings or numbers for + operator (got ${typeof left} and ${typeof right}).`,
        rawTemplateString: args.rawTemplateString,
        loc: this.loc,
      })
    }
  }
}

export class ContainsExpression extends BinaryExpression {
  override transform(
    collection: TemplatePrimitive | Collection<TemplateValue>,
    element: TemplatePrimitive | Collection<TemplateValue>,
    args: EvaluateArgs
  ): boolean {
    if (!isTemplatePrimitive(element)) {
      throw new TemplateStringError({
        message: `The right-hand side of a 'contains' operator must be a string, number, boolean or null (got ${typeof element}).`,
        rawTemplateString: args.rawTemplateString,
        loc: this.loc,
      })
    }

    if (typeof collection === "object" && collection !== null) {
      if (isArray(collection)) {
        return collection.some((v) => element === evaluateAndUnwrap({ value: v, context: args.context, opts: args.opts }))
      }

      return collection.hasOwnProperty(String(element))
    }

    if (typeof collection === "string") {
      return collection.includes(String(element))
    }

    throw new TemplateStringError({
      message: `The left-hand side of a 'contains' operator must be a string, array or object (got ${collection}).`,
      rawTemplateString: args.rawTemplateString,
      loc: this.loc,
    })
  }
}

export abstract class BinaryExpressionOnNumbers extends BinaryExpression {
  override transform(
    left: TemplatePrimitive | Collection<TemplateValue>,
    right: TemplatePrimitive | Collection<TemplateValue>,
    args: EvaluateArgs
  ): TemplatePrimitive | Collection<TemplateValue> {
    // All other operators require numbers to make sense (we're not gonna allow random JS weirdness)
    if (!isNumber(left) || !isNumber(right)) {
      throw new TemplateStringError({
        message: `Both terms need to be numbers for ${
          this.operator
        } operator (got ${typeof left} and ${typeof right}).`,
        rawTemplateString: args.rawTemplateString,
        loc: this.loc,
      })
    }

    return this.calculate(left, right)
  }

  abstract calculate(left: number, right: number): number | boolean
}

export class MultiplyExpression extends BinaryExpressionOnNumbers {
  override calculate(left: number, right: number): number {
    return left * right
  }
}

export class DivideExpression extends BinaryExpressionOnNumbers {
  override calculate(left: number, right: number): number {
    return left / right
  }
}

export class ModuloExpression extends BinaryExpressionOnNumbers {
  override calculate(left: number, right: number): number {
    return left % right
  }
}

export class SubtractExpression extends BinaryExpressionOnNumbers {
  override calculate(left: number, right: number): number {
    return left - right
  }
}

export class LessThanEqualExpression extends BinaryExpressionOnNumbers {
  override calculate(left: number, right: number): boolean {
    return left <= right
  }
}

export class GreaterThanEqualExpression extends BinaryExpressionOnNumbers {
  override calculate(left: number, right: number): boolean {
    return left >= right
  }
}

export class LessThanExpression extends BinaryExpressionOnNumbers {
  override calculate(left: number, right: number): boolean {
    return left < right
  }
}

export class GreaterThanExpression extends BinaryExpressionOnNumbers {
  override calculate(left: number, right: number): boolean {
    return left > right
  }
}

export class FormatStringExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly innerExpression: TemplateExpression,
    public readonly isOptional: boolean
  ) {
    super(loc)
  }

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const optional = args.optional !== undefined ? args.optional : this.isOptional

    return this.innerExpression.evaluate({
      ...args,
      optional,
    })
  }
}

export class ElseBlockExpression extends TemplateExpression {
  override evaluate(): never {
    // See also `buildConditionalTree` in `parser.pegjs`
    throw new InternalError({
      message: `{else} block expression should not end up in the final AST`,
    })
  }
}

export class EndIfBlockExpression extends TemplateExpression {
  override evaluate(): never {
    // See also `buildConditionalTree` in `parser.pegjs`
    throw new InternalError({
      message: `{endif} block expression should not end up in the final AST`,
    })
  }
}

export class IfBlockExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly condition: TemplateExpression,
    public ifTrue: TemplateExpression | undefined,
    public ifFalse: TemplateExpression | undefined
  ) {
    super(loc)
  }

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const condition = this.condition.evaluate(args)

    const evaluated = isTruthy(evaluateAndUnwrap({ value: condition, context: args.context, opts: args.opts }))
      ? this.ifTrue?.evaluate(args)
      : this.ifFalse?.evaluate(args)

    return mergeInputs(
      this.loc.source,
      evaluated ||
        new TemplateLeaf({
          expr: args.rawTemplateString,
          value: "",
          inputs: {},
        }),
      condition
    )
  }
}

export class StringConcatExpression extends TemplateExpression {
  public readonly expressions: TemplateExpression[]
  constructor(loc: Location, ...expressions: TemplateExpression[]) {
    super(loc)
    this.expressions = expressions
  }

  override evaluate(args: EvaluateArgs): TemplateLeaf<string> {
    const evaluatedExpressions: TemplateLeaf<TemplatePrimitive>[] = this.expressions.map((expr) => {
      const r = evaluate({ value: expr.evaluate(args), context: args.context, opts: args.opts })

      if (!isTemplateLeaf(r) || !isTemplatePrimitive(r.value)) {
        throw new TemplateStringError({
          message: `Cannot concatenate: expected primitive, but expression resolved to ${
            isTemplateLeaf(r) ? typeof r.value : typeof r
          }`,
          rawTemplateString: args.rawTemplateString,
          loc: this.loc,
        })
      }

      // The isPrimitive asserts that we are dealing with primitive values, and not empty arrays
      return r as TemplateLeaf<TemplatePrimitive>
    })

    const result = evaluatedExpressions.reduce((acc, expr) => {
      return `${acc}${expr.value === undefined ? "" : expr.value}`
    }, "")

    return mergeInputs(
      this.loc.source,
      new TemplateLeaf({
        expr: args.rawTemplateString,
        value: result,
        inputs: {},
      }),
      ...evaluatedExpressions
    ) as TemplateLeaf<string> // TODO: fix mergeInputs return type
  }
}

export class MemberExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly innerExpression: TemplateExpression
  ) {
    super(loc)
  }

  override evaluate(args: EvaluateArgs): TemplateLeaf<string | number> {
    const inner = this.innerExpression.evaluate(args)
    const innerValue = evaluateAndUnwrap({ value: inner, context: args.context, opts: args.opts })

    if (typeof innerValue !== "string" && typeof innerValue !== "number") {
      throw new TemplateStringError({
        message: `Expression in bracket must resolve to a string or number (got ${typeof innerValue}).`,
        rawTemplateString: args.rawTemplateString,
        loc: this.loc,
      })
    }

    return new TemplateLeaf({
      expr: args.rawTemplateString,
      value: innerValue,
      inputs: {},
    })
  }
}

export class ContextLookupExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly keyPath: (IdentifierExpression | MemberExpression)[]
  ) {
    super(loc)
  }

  override evaluate({ context, opts, optional, rawTemplateString }: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const evaluatedKeyPath = this.keyPath.map((k) => k.evaluate({ context, opts, optional, rawTemplateString }))
    const keyPath = evaluatedKeyPath.map((k) => k.value)

    let result: CollectionOrValue<TemplateValue>
    try {
      const r = context.resolve({
        key: keyPath,
        nodePath: [],
        opts: {
          // TODO: either decouple allowPartial and optional, or remove allowPartial.
          allowPartial: optional || opts.allowPartial,
          ...opts,
        },
      })
      result = r.result
    } catch (e) {
      if (e instanceof InternalError) {
        throw e
      }
      // TODO: Maybe context.resolve should never throw, for increased performance.
      if (e instanceof GardenError) {
        throw new TemplateStringError({
          message: e.message,
          rawTemplateString,
          loc: this.loc,
        })
      }
      throw e
    }

    let wrappedResult: CollectionOrValue<TemplateValue> = new WrapContextLookupInputsLazily(
      this.loc.source,
      result,
      keyPath,
      rawTemplateString
    )

    // eagerly wrap values if result doesn't contain lazy values anyway.
    // otherwise we wrap the values at a later time, when actually necessary.
    if (!containsLazyValues(result)) {
      wrappedResult = evaluate({ value: wrappedResult, context, opts })
    }

    // Add inputs from the keyPath expressions as well.
    return mergeInputs(this.loc.source, wrappedResult, ...evaluatedKeyPath)
  }
}

export class FunctionCallExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly functionName: IdentifierExpression,
    public readonly args: TemplateExpression[]
  ) {
    super(loc)
  }

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const functionArgs = this.args.map((arg) =>
      evaluate({ value: arg.evaluate(args), context: args.context, opts: args.opts })
    )
    const functionName = this.functionName.evaluate(args)

    let result: CollectionOrValue<TemplateValue>

    result = this.callHelperFunction({
      functionName: functionName.value,
      args: functionArgs,
      text: args.rawTemplateString,
      context: args.context,
      opts: args.opts,
    })

    return mergeInputs(this.loc.source, result, functionName)
  }

  callHelperFunction({
    functionName,
    args,
    text,
    context,
    opts,
  }: {
    functionName: string
    args: CollectionOrValue<TemplateValue>[]
    text: string
    context: ConfigContext
    opts: ContextResolveOpts
  }): CollectionOrValue<TemplateValue> {
    const helperFunctions = getHelperFunctions()
    const spec = helperFunctions[functionName]

    if (!spec) {
      const availableFns = Object.keys(helperFunctions).join(", ")
      throw new TemplateStringError({
        message: `Could not find helper function '${functionName}'. Available helper functions: ${availableFns}`,
        rawTemplateString: text,
        loc: this.loc,
      })
    }

    const resolvedArgs: unknown[] = []

    for (const arg of args) {
      const value = evaluateAndUnwrap({ value: arg, context, opts })

      // Note: At the moment, we always transform template values to raw values and perform the default input tracking for them;
      // We might have to reconsider this once we need template helpers that perform input tracking on its own for non-collection arguments.
      if (isTemplateLeafValue(value)) {
        resolvedArgs.push(value)
      } else if (spec.skipInputTrackingForCollectionValues) {
        // This template helper is aware of TemplateValue instances, and will perform input tracking on its own.
        resolvedArgs.push(value)
      } else {
        // This argument is a collection, and the template helper cannot deal with TemplateValue instances.
        // We will unwrap this collection and resolve all values, and then perform default input tracking.
        resolvedArgs.push(deepEvaluateAndUnwrap({ value: value, context, opts }))
      }
    }

    // Validate args
    let i = 0
    for (const [argName, schema] of Object.entries(spec.arguments)) {
      const value = resolvedArgs[i]
      const schemaDescription = spec.argumentDescriptions[argName]

      if (value === undefined && schemaDescription.flags?.presence === "required") {
        throw new TemplateStringError({
          message: `Missing argument '${argName}' (at index ${i}) for ${functionName} helper function.`,
          rawTemplateString: text,
          loc: this.loc,
        })
      }

      const loc = this.loc
      class FunctionCallValidationError extends TemplateStringError {
        constructor({ message }: { message: string }) {
          super({
            message: message,
            rawTemplateString: text,
            loc: loc,
          })
        }
      }

      resolvedArgs[i] = validateSchema(value, schema, {
        context: `argument '${argName}' for ${functionName} helper function`,
        ErrorClass: FunctionCallValidationError,
      })
      i++
    }

    let result: CollectionOrValue<TemplateLeafValue | TemplateValue>

    try {
      result = spec.fn(...resolvedArgs)
    } catch (error) {
      throw new TemplateStringError({
        message: `Error from helper function ${functionName}: ${error}`,
        rawTemplateString: text,
        loc: this.loc,
      })
    }

    // We only need to augment inputs for primitive args in case skipInputTrackingForCollectionValues is true.
    const trackedArgs = args.filter((arg) => {
      if (isTemplateLeaf(arg)) {
        return true
      }

      // This argument is a collection; We only apply the default input tracking algorithm for primitive args if skipInputTrackingForCollectionValues is NOT true.
      return spec.skipInputTrackingForCollectionValues !== true
    })

    // e.g. result of join() is a string, so we need to wrap it in a TemplateValue instance and merge inputs
    // even though slice() returns an array, if the resulting array is empty, it's a template primitive and thus we need to wrap it in a TemplateValue instance
    if (isTemplateLeafValue(result)) {
      return mergeInputs(
        this.loc.source,
        new TemplateLeaf({
          expr: text,
          value: result,
          // inputs will be augmented by mergeInputs
          inputs: {},
        }),
        ...trackedArgs
      )
    } else if (isTemplateLeaf(result)) {
      if (!spec.skipInputTrackingForCollectionValues) {
        throw new InternalError({
          message: `Helper function ${functionName} returned a TemplateValue instance, but skipInputTrackingForCollectionValues is not true`,
        })
      }
      return mergeInputs(this.loc.source, result, ...trackedArgs)
    } else {
      // Result is a collection;

      // if skipInputTrackingForCollectionValues is true, the function handles input tracking, so leafs are TemplateValue instances.
      if (spec.skipInputTrackingForCollectionValues) {
        return deepMap(result, (v) => {
          if (isTemplatePrimitive(v)) {
            throw new InternalError({
              message: `Helper function ${functionName} returned a collection, skipInputTrackingForCollectionValues is true and collection values are not TemplateValue instances`,
            })
          }
          return mergeInputs(this.loc.source, v, ...trackedArgs)
        })
      } else {
        // if skipInputTrackingForCollectionValues is false; Now the values are TemplatePrimitives.
        // E.g. this would be the case for split() which turns a string input into a primitive string array.
        // templatePrimitiveDeepMap will crash if the function misbehaved and returned TemplateValue
        return templatePrimitiveDeepMap(result as CollectionOrValue<TemplateLeafValue>, (v) => {
          return mergeInputs(
            this.loc.source,
            new TemplateLeaf({
              expr: text,
              value: v,
              // inputs will be augmented by mergeInputs
              inputs: {},
            }),
            ...trackedArgs
          )
        })
      }
    }
  }
}

export class TernaryExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly condition: TemplateExpression,
    public readonly ifTrue: TemplateExpression,
    public readonly ifFalse: TemplateExpression
  ) {
    super(loc)
  }

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const conditionResult = this.condition.evaluate({
      ...args,
      optional: true,
    })

    // evaluate ternary expression
    const evaluationResult = isTruthy(evaluateAndUnwrap({ value: conditionResult, context: args.context, opts: args.opts }))
      ? this.ifTrue.evaluate(args)
      : this.ifFalse.evaluate(args)

    // merge inputs from the condition and the side that was evaluated
    return mergeInputs(this.loc.source, evaluationResult, conditionResult)
  }
}
