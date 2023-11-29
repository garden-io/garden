/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isEmpty, isNumber, isString } from "lodash-es"
import {
  renderKeyPath,
  type ConfigContext,
  type ContextResolveOpts,
  type ObjectPath,
} from "../config/template-contexts/base.js"
import { GardenError, NotImplementedError, TemplateStringError } from "../exceptions.js"
import { deepMap } from "../util/objects.js"
import { callHelperFunction } from "./functions.js"
import { TemplateLeaf, isTemplateLeaf, isTemplatePrimitive, mergeInputs } from "./inputs.js"
import type { CollectionOrValue, TemplatePrimitive } from "./inputs.js"

export class ContextResolveError extends GardenError {
  type = "context-resolve"
}

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

export class LogicalExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly operator: string,
    public readonly left: TemplateExpression,
    public readonly right: TemplateExpression
  ) {
    super(loc)
  }

  override evaluate(args: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const isTruthy = (v: CollectionOrValue<TemplateLeaf>) => {
      if (isTemplateLeaf(v)) {
        return v.value
      } else {
        return !isEmpty(v)
      }
    }

    switch (this.operator) {
      case "||":
        const left = this.left.evaluate({
          ...args,
          optional: true,
        })

        if (isTruthy(left)) {
          return left
        } else {
          const right = this.right.evaluate(args)
          return mergeInputs(right, left)
        }

      case "&&":
        const leftRes = this.left.evaluate(args)
        const rightRes = this.right.evaluate(args)

        if (isTruthy(leftRes) && isTruthy(rightRes)) {
          return mergeInputs(rightRes, leftRes)
        } else {
          return mergeInputs(leftRes, rightRes)
        }

      default:
        throw new NotImplementedError({
          message: `Logical operator ${this.operator} not implemented`,
        })
    }
  }
}

export class BinaryExpression extends TemplateExpression {
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

    const primitiveLeaf = (primitive: TemplatePrimitive) =>
      mergeInputs(
        new TemplateLeaf({
          expr: args.rawTemplateString,
          value: primitive,
          inputs: {},
        }),
        left,
        right
      )

    switch (this.operator) {
      case "==":
        return primitiveLeaf(leftValue === rightValue)
      case "!=":
        return primitiveLeaf(leftValue !== rightValue)
      case "+":
        if (isNumber(leftValue) && isNumber(rightValue)) {
          return primitiveLeaf(leftValue + rightValue)
        } else if (isString(leftValue) && isString(leftValue)) {
          return primitiveLeaf(leftValue + rightValue)
        } else if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
          // In this special case, simply return the concatenated arrays.
          // Input tracking has been taken care of already in this case, as leaf objects are preserved.
          return leftValue.concat(rightValue)
        } else {
          throw new TemplateStringError({
            message: `Both terms need to be either arrays or strings or numbers for + operator (got ${typeof leftValue} and ${typeof rightValue}).`,
          })
        }
    }

    // All other operators require numbers to make sense (we're not gonna allow random JS weirdness)
    if (!isNumber(leftValue) || !isNumber(rightValue)) {
      throw new TemplateStringError({
        message: `Both terms need to be numbers for ${
          this.operator
        } operator (got ${typeof leftValue} and ${typeof rightValue}).`,
      })
    }

    switch (this.operator) {
      case "*":
        return primitiveLeaf(leftValue * rightValue)
      case "/":
        return primitiveLeaf(leftValue / rightValue)
      case "%":
        return primitiveLeaf(leftValue % rightValue)
      case "-":
        return primitiveLeaf(leftValue - rightValue)
      case "<=":
        return primitiveLeaf(leftValue <= rightValue)
      case ">=":
        return primitiveLeaf(leftValue >= rightValue)
      case "<":
        return primitiveLeaf(leftValue < rightValue)
      case ">":
        return primitiveLeaf(leftValue > rightValue)
      default:
        throw new NotImplementedError({
          message: `Logical operator ${this.operator} not implemented`,
        })
    }
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

    return this.innerExpression.evaluate({ ...args, optional })
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

export class ContextLookupExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly key: ObjectPath
  ) {
    super(loc)
  }

  override evaluate({ context, opts, optional, rawTemplateString }: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const { result, message } = context.resolve({
      key: this.key,
      nodePath: [],
      opts,
    })

    if (isTemplateLeaf(result) && result.value === undefined) {
      if (!optional) {
        // The interface is super awkward. Why does context.resolve return a message and not just throw?
        throw new TemplateStringError({
          message: message || "resolve returned undefined and no message",
        })
      }
    }

    const addTemplateReferenceInformation = (v: TemplateLeaf, keyPath: ObjectPath) => {
      return new TemplateLeaf({
        expr: rawTemplateString,
        value: v.value,
        inputs: {
          // key might be something like ["var", "foo", "bar"]
          // We also add the keypath to get separate keys for ever
          [renderKeyPath([...this.key, ...keyPath])]: v,
        },
      })
    }

    const enriched = isTemplateLeaf(result)
      ? addTemplateReferenceInformation(result, [])
      : deepMap(result, (v, _key, keyPath) => addTemplateReferenceInformation(v, keyPath))

    return enriched
  }
}

export class FunctionCallExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly functionName: string,
    public readonly args: TemplateExpression[]
  ) {
    super(loc)
  }

  override evaluate(evaluateArgs: EvaluateArgs): CollectionOrValue<TemplateLeaf> {
    const args = this.args.map((arg) => arg.evaluate(evaluateArgs))
    // TODO: handle inputs correctly
    const result = callHelperFunction({
      functionName: this.functionName,
      args,
      text: evaluateArgs.rawTemplateString,
    })

    return result
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
    const conditionResult = this.condition.evaluate(args)

    // Get value for left hand side if it's a TemplateValue
    const conditionalValue = isTemplateLeaf(conditionResult) ? conditionResult.value : conditionResult

    // evaluate ternary expression
    const evaluationResult = conditionalValue ? this.ifTrue.evaluate(args) : this.ifFalse.evaluate(args)

    // merge inputs from the condition and the side that was evaluated
    return mergeInputs(evaluationResult, conditionResult)
  }
}
