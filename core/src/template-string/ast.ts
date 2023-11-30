/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray, isEmpty, isNumber, isString } from "lodash-es"
import {
  renderKeyPath,
  type ConfigContext,
  type ContextResolveOpts,
  type ObjectPath,
} from "../config/template-contexts/base.js"
import { TemplateStringError } from "../exceptions.js"
import { deepMap } from "../util/objects.js"
import { callHelperFunction } from "./functions.js"
import { TemplateLeaf, isTemplateLeaf, isTemplatePrimitive, mergeInputs } from "./inputs.js"
import type { Collection, CollectionOrValue, TemplatePrimitive } from "./inputs.js"

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
type Location = {
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
}

export abstract class TemplateExpression {
  constructor(public readonly loc: Location) {}

  abstract evaluate(args: EvaluateArgs): CollectionOrValue<TemplateLeaf>
}

export class IdentifierExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly name: string
  ) {
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

export abstract class UnaryExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly innerExpression: TemplateExpression
  ) {
    super(loc)
  }

  evaluate(args: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const inner = this.innerExpression.evaluate(args)

    const innerValue = isTemplateLeaf(inner) ? inner.value : inner

    return mergeInputs(
      new TemplateLeaf({
        expr: args.rawTemplateString,
        value: this.transform(innerValue),
        inputs: {},
      }),
      inner
    )
  }

  abstract transform(value: TemplatePrimitive | Collection<TemplateLeaf>): TemplatePrimitive
}

export class TypeofExpression extends UnaryExpression {
  transform(value: TemplatePrimitive | Collection<TemplateLeaf>): string {
    return typeof value
  }
}

export class NotExpression extends UnaryExpression {
  transform(value: TemplatePrimitive | Collection<TemplateLeaf>): boolean {
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

function isTruthy(v: CollectionOrValue<TemplateLeaf>): boolean {
  if (isTemplateLeaf(v)) {
    return !!v.value
  } else {
    return !isEmpty(v)
  }
}

export class LogicalOrExpression extends LogicalExpression {
  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const left = this.left.evaluate({
      ...args,
      optional: true,
    })

    if (isTruthy(left)) {
      return left
    }

    const right = this.right.evaluate(args)
    return mergeInputs(right, left)
  }
}

export class LogicalAndExpression extends LogicalExpression {
  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
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

    if (!isTruthy(left)) {
      // Javascript would return the value on the left; we return false in case the value is undefined. This is a quirk of Garden's template languate that we want to keep for backwards compatibility.
      if (isTemplateLeaf(left) && left.value === undefined) {
        return mergeInputs(
          new TemplateLeaf({
            expr: args.rawTemplateString,
            value: false,
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
      if (isTemplateLeaf(right) && right.value === undefined) {
        return mergeInputs(
          new TemplateLeaf({
            expr: args.rawTemplateString,
            value: false,
            inputs: {},
          }),
          right,
          left
        )
      } else {
        return mergeInputs(right, left)
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

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const left = this.left.evaluate(args)
    const right = this.right.evaluate(args)

    const leftValue = isTemplateLeaf(left) ? left.value : left
    const rightValue = isTemplateLeaf(right) ? right.value : right

    const transformed = this.transform(leftValue, rightValue)

    if (isTemplatePrimitive(transformed)) {
      return mergeInputs(
        new TemplateLeaf({
          expr: args.rawTemplateString,
          value: transformed,
          inputs: {},
        }),
        left,
        right
      )
    }

    return mergeInputs(transformed, left, right)
  }

  abstract transform(
    left: TemplatePrimitive | Collection<TemplateLeaf>,
    right: TemplatePrimitive | Collection<TemplateLeaf>
  ): TemplatePrimitive | Collection<TemplateLeaf>
}

export class EqualExpression extends BinaryExpression {
  transform(
    left: TemplatePrimitive | Collection<TemplateLeaf>,
    right: TemplatePrimitive | Collection<TemplateLeaf>
  ): boolean {
    return left === right
  }
}

export class NotEqualExpression extends BinaryExpression {
  transform(
    left: TemplatePrimitive | Collection<TemplateLeaf>,
    right: TemplatePrimitive | Collection<TemplateLeaf>
  ): boolean {
    return left !== right
  }
}

export class AddExpression extends BinaryExpression {
  transform(
    left: TemplatePrimitive | Collection<TemplateLeaf>,
    right: TemplatePrimitive | Collection<TemplateLeaf>
  ): TemplatePrimitive | Collection<TemplateLeaf> {
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
      })
    }
  }
}

export class ContainsExpression extends BinaryExpression {
  transform(
    collection: TemplatePrimitive | Collection<TemplateLeaf>,
    element: TemplatePrimitive | Collection<TemplateLeaf>
  ): boolean {
    if (!isTemplatePrimitive(element)) {
      throw new TemplateStringError({
        message: `The right-hand side of a 'contains' operator must be a string, number, boolean or null (got ${typeof element}).`,
      })
    }

    if (typeof collection === "object" && collection !== null) {
      if (isArray(collection)) {
        return collection.some((v) => isTemplateLeaf(v) && v.value === element)
      }

      return collection.hasOwnProperty(String(element))
    }

    if (typeof collection === "string") {
      return collection.includes(String(element))
    }

    throw new TemplateStringError({
      message: `The left-hand side of a 'contains' operator must be a string, array or object (got ${collection}).`,
    })
  }
}

export abstract class BinaryExpressionOnNumbers extends BinaryExpression {
  override transform(
    left: TemplatePrimitive | Collection<TemplateLeaf>,
    right: TemplatePrimitive | Collection<TemplateLeaf>
  ): TemplatePrimitive | Collection<TemplateLeaf> {
    // All other operators require numbers to make sense (we're not gonna allow random JS weirdness)
    if (!isNumber(left) || !isNumber(right)) {
      throw new TemplateStringError({
        message: `Both terms need to be numbers for ${
          this.operator
        } operator (got ${typeof left} and ${typeof right}).`,
      })
    }

    return this.calculate(left, right)
  }

  abstract calculate(left: number, right: number): number | boolean
}

export class MultiplyExpression extends BinaryExpressionOnNumbers {
  calculate(left: number, right: number): number {
    return left * right
  }
}

export class DivideExpression extends BinaryExpressionOnNumbers {
  calculate(left: number, right: number): number {
    return left / right
  }
}

export class ModuloExpression extends BinaryExpressionOnNumbers {
  calculate(left: number, right: number): number {
    return left % right
  }
}

export class SubtractExpression extends BinaryExpressionOnNumbers {
  calculate(left: number, right: number): number {
    return left - right
  }
}

export class LessThanEqualExpression extends BinaryExpressionOnNumbers {
  calculate(left: number, right: number): boolean {
    return left <= right
  }
}

export class GreaterThanEqualExpression extends BinaryExpressionOnNumbers {
  calculate(left: number, right: number): boolean {
    return left >= right
  }
}

export class LessThanExpression extends BinaryExpressionOnNumbers {
  calculate(left: number, right: number): boolean {
    return left < right
  }
}

export class GreaterThanExpression extends BinaryExpressionOnNumbers {
  calculate(left: number, right: number): boolean {
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

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const optional = args.optional !== undefined ? args.optional : this.isOptional

    return this.innerExpression.evaluate({
      ...args,
      optional,
    })
  }
}

export class StringConcatExpression extends TemplateExpression {
  public readonly expressions: TemplateExpression[]
  constructor(loc: Location, ...expressions: TemplateExpression[]) {
    super(loc)
    this.expressions = expressions
  }

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const evaluatedExpressions: TemplateLeaf<TemplatePrimitive>[] = this.expressions.map((expr) => {
      const r = expr.evaluate(args)

      if (!isTemplateLeaf(r) || !isTemplatePrimitive(r.value)) {
        throw new TemplateStringError({
          message: `Cannot concatenate: expected primitive, but expression resolved to ${
            isTemplateLeaf(r) ? typeof r.value : typeof r
          }`,
        })
      }

      // The isPrimitive asserts that we are dealing with primitive values, and not empty arrays
      return r as TemplateLeaf<TemplatePrimitive>
    })

    const result = evaluatedExpressions.reduce((acc, expr) => {
      return `${acc}${expr.value === undefined ? "" : expr.value}`
    }, "")

    return mergeInputs(
      new TemplateLeaf({
        expr: args.rawTemplateString,
        value: result,
        inputs: {},
      }),
      ...evaluatedExpressions
    )
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
    const innerValue = isTemplateLeaf(inner) ? inner.value : inner

    if (typeof innerValue !== "string" && typeof innerValue !== "number") {
      throw new TemplateStringError({
        message: `Expression in bracket must resolve to a string or number (got ${typeof innerValue}).`,
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

  override evaluate({ context, opts, optional, rawTemplateString }: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const evaluatedKeyPath = this.keyPath.map((k) => k.evaluate({ context, opts, optional, rawTemplateString }))
    const keyPath = evaluatedKeyPath.map((k) => k.value)

    const { result } = context.resolve({
      key: keyPath,
      nodePath: [],
      opts: {
        // TODO: either decouple allowPartial and optional, or remove allowPartial.
        allowPartial: optional || opts.allowPartial,
        ...opts,
      },
    })

    const addTemplateReferenceInformation = (v: TemplateLeaf, collectionKeyPath: ObjectPath) => {
      return new TemplateLeaf({
        expr: rawTemplateString,
        value: v.value,
        inputs: {
          // key might be something like ["var", "foo", "bar"]
          // We also add the keypath to get separate keys for ever
          [renderKeyPath([...keyPath, ...collectionKeyPath])]: v,
        },
      })
    }

    const enriched = isTemplateLeaf(result)
      ? addTemplateReferenceInformation(result, [])
      : deepMap(result, (v, _key, collectionKeyPath) => addTemplateReferenceInformation(v, collectionKeyPath))

    // Add inputs from the keyPath expressions as well.
    return mergeInputs(enriched, ...evaluatedKeyPath)
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

  override evaluate(evaluateArgs: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const args = this.args.map((arg) => arg.evaluate(evaluateArgs))
    const functionName = this.functionName.evaluate(evaluateArgs)
    // TODO: handle inputs correctly
    const result = callHelperFunction({
      functionName: functionName.value,
      args,
      text: evaluateArgs.rawTemplateString,
    })

    return mergeInputs(result, functionName)
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

  evaluate(args: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const conditionResult = this.condition.evaluate({
      ...args,
      optional: true,
    })

    // Get value for left hand side if it's a TemplateValue
    const conditionalValue = isTemplateLeaf(conditionResult) ? conditionResult.value : conditionResult

    // evaluate ternary expression
    const evaluationResult = conditionalValue ? this.ifTrue.evaluate(args) : this.ifFalse.evaluate(args)

    // merge inputs from the condition and the side that was evaluated
    return mergeInputs(evaluationResult, conditionResult)
  }
}
