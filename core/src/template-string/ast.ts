/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray, isEmpty, isNumber, isString } from "lodash-es"
import { type ConfigContext, type ContextResolveOpts } from "../config/template-contexts/base.js"
import { InternalError, TemplateStringError } from "../exceptions.js"
import { callHelperFunction } from "./functions.js"
import { TemplateLeaf, isTemplateLeaf, isTemplatePrimitive, mergeInputs } from "./inputs.js"
import type { TemplatePrimitive, TemplateValue } from "./inputs.js"
import { WrapContextLookupInputsLazily, unwrap, unwrapLazyValues } from "./lazy.js"
import { Collection, CollectionOrValue } from "../util/objects.js"

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

  abstract evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue>
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

  evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const inner = this.innerExpression.evaluate(args)

    const innerValue = unwrap({ value: inner, context: args.context, opts: args.opts })

    return mergeInputs(
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
  transform(value: TemplatePrimitive | Collection<TemplateValue>): string {
    return typeof value
  }
}

export class NotExpression extends UnaryExpression {
  transform(value: TemplatePrimitive | Collection<TemplateValue>): boolean {
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
function isTruthy(v: TemplatePrimitive | Collection<TemplateValue>): boolean {
  if (isTemplatePrimitive(v)) {
    return !!v
  } else {
    // it's a collection
    return !isEmpty(v)
  }
}

export class LogicalOrExpression extends LogicalExpression {
  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const left = this.left.evaluate({
      ...args,
      optional: true,
    })

    if (isTruthy(unwrap({ value: left, context: args.context, opts: args.opts }))) {
      return left
    }

    const right = this.right.evaluate(args)
    return mergeInputs(right, left)
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

    const leftValue = unwrap({ value: left, context: args.context, opts: args.opts })
    if (!isTruthy(leftValue)) {
      // Javascript would return the value on the left; we return false in case the value is undefined. This is a quirk of Garden's template languate that we want to keep for backwards compatibility.
      if (leftValue === undefined) {
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
      const rightValue = unwrap({ value: right, context: args.context, opts: args.opts })
      if (rightValue === undefined) {
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

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const left = this.left.evaluate(args)
    const right = this.right.evaluate(args)

    const leftValue = unwrap({ value: left, context: args.context, opts: args.opts })
    const rightValue = unwrap({ value: right, context: args.context, opts: args.opts })

    const transformed = this.transform(leftValue, rightValue, args)

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
  transform(
    left: TemplatePrimitive | Collection<TemplateValue>,
    right: TemplatePrimitive | Collection<TemplateValue>
  ): boolean {
    return left === right
  }
}

export class NotEqualExpression extends BinaryExpression {
  transform(
    left: TemplatePrimitive | Collection<TemplateValue>,
    right: TemplatePrimitive | Collection<TemplateValue>
  ): boolean {
    return left !== right
  }
}

export class AddExpression extends BinaryExpression {
  transform(
    left: TemplatePrimitive | Collection<TemplateValue>,
    right: TemplatePrimitive | Collection<TemplateValue>
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
      })
    }
  }
}

export class ContainsExpression extends BinaryExpression {
  transform(
    collection: TemplatePrimitive | Collection<TemplateValue>,
    element: TemplatePrimitive | Collection<TemplateValue>,
    args: EvaluateArgs
  ): boolean {
    if (!isTemplatePrimitive(element)) {
      throw new TemplateStringError({
        message: `The right-hand side of a 'contains' operator must be a string, number, boolean or null (got ${typeof element}).`,
      })
    }

    if (typeof collection === "object" && collection !== null) {
      if (isArray(collection)) {
        return collection.some((v) => element === unwrap({ value: v, context: args.context, opts: args.opts }))
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
    left: TemplatePrimitive | Collection<TemplateValue>,
    right: TemplatePrimitive | Collection<TemplateValue>
  ): TemplatePrimitive | Collection<TemplateValue> {
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

    const evaluated = isTruthy(unwrap({ value: condition, context: args.context, opts: args.opts }))
      ? this.ifTrue?.evaluate(args)
      : this.ifFalse?.evaluate(args)

    return mergeInputs(
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
      const r = unwrapLazyValues({ value: expr.evaluate(args), context: args.context, opts: args.opts })

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
    const innerValue = unwrap({ value: inner, context: args.context, opts: args.opts })

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

  override evaluate({ context, opts, optional, rawTemplateString }: EvaluateArgs): CollectionOrValue<TemplateValue> {
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

    // Add inputs from the keyPath expressions as well.
    return mergeInputs(new WrapContextLookupInputsLazily(result, keyPath, rawTemplateString), ...evaluatedKeyPath)
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
      unwrapLazyValues({ value: arg.evaluate(args), context: args.context, opts: args.opts })
    )
    const functionName = this.functionName.evaluate(args)

    const result = callHelperFunction({
      functionName: functionName.value,
      args: functionArgs,
      text: args.rawTemplateString,
      context: args.context,
      opts: args.opts,
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

  evaluate(args: EvaluateArgs): CollectionOrValue<TemplateValue> {
    const conditionResult = this.condition.evaluate({
      ...args,
      optional: true,
    })

    // evaluate ternary expression
    const evaluationResult = isTruthy(unwrap({ value: conditionResult, context: args.context, opts: args.opts }))
      ? this.ifTrue.evaluate(args)
      : this.ifFalse.evaluate(args)

    // merge inputs from the condition and the side that was evaluated
    return mergeInputs(evaluationResult, conditionResult)
  }
}
