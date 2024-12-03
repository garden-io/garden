/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray, isNumber, isString } from "lodash-es"
import {
  CONTEXT_RESOLVE_KEY_AVAILABLE_LATER,
  CONTEXT_RESOLVE_KEY_NOT_FOUND,
  renderKeyPath,
  type ConfigContext,
  type ContextResolveOpts,
} from "../config/template-contexts/base.js"
import { InternalError, TemplateStringError } from "../exceptions.js"
import { getHelperFunctions } from "./functions.js"
import { isTemplatePrimitive, type TemplatePrimitive } from "./types.js"
import type { Collection, CollectionOrValue } from "../util/objects.js"
import type { ConfigSource } from "../config/validation.js"
import { validateSchema } from "../config/validation.js"
import type { TemplateExpressionGenerator } from "./static-analysis.js"

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
  source?: ConfigSource
}

export type TemplateEvaluationResult =
  | TemplatePrimitive
  | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
  | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER

function* astVisitAll(e: TemplateExpression): TemplateExpressionGenerator {
  for (const key in e) {
    if (key === "loc") {
      continue
    }
    const propertyValue = e[key]
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

  abstract evaluate(
    args: EvaluateArgs
  ):
    | CollectionOrValue<TemplatePrimitive>
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
    | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER
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

  override evaluate(): string {
    return this.name
  }
}

export class LiteralExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly literal: TemplatePrimitive
  ) {
    super(loc)
  }

  override evaluate(_args: EvaluateArgs): TemplatePrimitive {
    return this.literal
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

  override evaluate(
    args: EvaluateArgs
  ):
    | CollectionOrValue<TemplatePrimitive>
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
    | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const result: CollectionOrValue<TemplatePrimitive> = []
    for (const e of this.literal) {
      const res = e.evaluate(args)
      if (typeof res === "symbol") {
        return res
      }
      result.push(res)
    }

    return result
  }
}

export abstract class UnaryExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly innerExpression: TemplateExpression
  ) {
    super(loc)
  }

  override evaluate(
    args: EvaluateArgs
  ): TemplatePrimitive | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const inner = this.innerExpression.evaluate(args)

    if (typeof inner === "symbol") {
      return inner
    }

    return this.transform(inner)
  }

  abstract transform(value: CollectionOrValue<TemplatePrimitive>): TemplatePrimitive
}

export class TypeofExpression extends UnaryExpression {
  override transform(value: CollectionOrValue<TemplatePrimitive>): string {
    return typeof value
  }
}

export class NotExpression extends UnaryExpression {
  override transform(value: CollectionOrValue<TemplatePrimitive>): boolean {
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
export function isTruthy(v: CollectionOrValue<TemplatePrimitive>): boolean {
  if (isTemplatePrimitive(v)) {
    return !!v
  } else {
    // collections are truthy, regardless wether they are empty or not.
    v satisfies Collection<TemplatePrimitive>
    return true
  }
}

export class LogicalOrExpression extends LogicalExpression {
  override evaluate(
    args: EvaluateArgs
  ):
    | CollectionOrValue<TemplatePrimitive>
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
    | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const left = this.left.evaluate({
      ...args,
      optional: true,
    })

    if (left === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      // If key might be available later, we can't decide which branch to take in the logical expression yet.
      return left
    }

    if (left !== CONTEXT_RESOLVE_KEY_NOT_FOUND && isTruthy(left)) {
      return left
    }

    return this.right.evaluate(args)
  }
}

export class LogicalAndExpression extends LogicalExpression {
  override evaluate(
    args: EvaluateArgs
  ):
    | CollectionOrValue<TemplatePrimitive>
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
    | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const left = this.left.evaluate({
      ...args,
      optional: true,
    })

    if (left === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      // If key might be available later, we can't decide which branch to take in the logical expression yet.
      return left
    }

    // We return false in case the variable could not be resolved. This is a quirk of Garden's template language that we want to keep for backwards compatibility.
    if (left === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
      return false
    }

    if (!isTruthy(left)) {
      return left
    }

    const right = this.right.evaluate({
      ...args,
      optional: true,
    })

    if (right === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      // If key might be available later, we can't decide on a final value yet and the logical expression needs to be reevaluated later.
      return right
    }

    if (right === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
      return false
    }

    return right
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

  override evaluate(
    args: EvaluateArgs
  ):
    | CollectionOrValue<TemplatePrimitive>
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
    | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const left = this.left.evaluate(args)

    if (left === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      return left
    }

    const right = this.right.evaluate(args)

    if (right === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      return right
    }

    if (left === CONTEXT_RESOLVE_KEY_NOT_FOUND || right === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
      return CONTEXT_RESOLVE_KEY_NOT_FOUND
    }

    return this.transform(left, right, args)
  }

  abstract transform(
    left: CollectionOrValue<TemplatePrimitive>,
    right: CollectionOrValue<TemplatePrimitive>,
    args: EvaluateArgs
  ): CollectionOrValue<TemplatePrimitive>
}

export class EqualExpression extends BinaryExpression {
  override transform(left: CollectionOrValue<TemplatePrimitive>, right: CollectionOrValue<TemplatePrimitive>): boolean {
    return left === right
  }
}

export class NotEqualExpression extends BinaryExpression {
  override transform(left: CollectionOrValue<TemplatePrimitive>, right: CollectionOrValue<TemplatePrimitive>): boolean {
    return left !== right
  }
}

export class AddExpression extends BinaryExpression {
  override transform(
    left: CollectionOrValue<TemplatePrimitive>,
    right: CollectionOrValue<TemplatePrimitive>,
    args: EvaluateArgs
  ): CollectionOrValue<TemplatePrimitive> {
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
    collection: CollectionOrValue<TemplatePrimitive>,
    element: CollectionOrValue<TemplatePrimitive>,
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
        return collection.some((v) => element === v)
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
    left: CollectionOrValue<TemplatePrimitive>,
    right: CollectionOrValue<TemplatePrimitive>,
    args: EvaluateArgs
  ): CollectionOrValue<TemplatePrimitive> {
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

  override evaluate(
    args: EvaluateArgs
  ):
    | CollectionOrValue<TemplatePrimitive>
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
    | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const optional = args.optional !== undefined ? args.optional : this.isOptional

    const result = this.innerExpression.evaluate({
      ...args,
      optional,
    })

    if (optional && result === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
      return undefined
    }

    return result
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

  override evaluate(
    args: EvaluateArgs
  ):
    | CollectionOrValue<TemplatePrimitive>
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
    | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const condition = this.condition.evaluate(args)

    if (typeof condition === "symbol") {
      return condition
    }

    const evaluated = isTruthy(condition) ? this.ifTrue?.evaluate(args) : this.ifFalse?.evaluate(args)

    return evaluated
  }
}

export class StringConcatExpression extends TemplateExpression {
  public readonly expressions: TemplateExpression[]
  constructor(loc: Location, ...expressions: TemplateExpression[]) {
    super(loc)
    this.expressions = expressions
  }

  override evaluate(
    args: EvaluateArgs
  ): string | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const evaluatedExpressions: TemplatePrimitive[] = []

    for (const expr of this.expressions) {
      const r = expr.evaluate(args)

      if (typeof r === "symbol") {
        return r
      }

      if (!isTemplatePrimitive(r)) {
        throw new TemplateStringError({
          message: `Cannot concatenate: expected primitive, but expression resolved to ${typeof r}`,
          rawTemplateString: args.rawTemplateString,
          loc: this.loc,
        })
      }

      evaluatedExpressions.push(r)
    }

    const result = evaluatedExpressions.reduce<string>((acc, value) => {
      return `${acc}${value === undefined ? "" : value}`
    }, "")

    return result
  }
}

export class MemberExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly innerExpression: TemplateExpression
  ) {
    super(loc)
  }

  override evaluate(
    args: EvaluateArgs
  ): string | number | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const inner = this.innerExpression.evaluate(args)

    if (inner === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
      return inner
    }

    if (typeof inner !== "string" && typeof inner !== "number") {
      throw new TemplateStringError({
        message: `Expression in brackets must resolve to a string or number (got ${typeof inner}).`,
        rawTemplateString: args.rawTemplateString,
        loc: this.loc,
      })
    }

    return inner
  }
}

export class ContextLookupExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly keyPath: (IdentifierExpression | MemberExpression)[]
  ) {
    super(loc)
  }

  override evaluate({
    context,
    opts,
    optional,
    rawTemplateString,
  }: EvaluateArgs):
    | CollectionOrValue<TemplatePrimitive>
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
    | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const keyPath: (string | number)[] = []
    for (const k of this.keyPath) {
      const evaluated = k.evaluate({ context, opts, optional, rawTemplateString })
      if (typeof evaluated === "symbol") {
        return evaluated
      }
      keyPath.push(evaluated)
    }

    const { resolved, message } = context.resolve({
      key: keyPath,
      nodePath: [],
      opts,
    })

    // if context returns key available later, then we do not need to throw, because partial mode is enabled.
    if (resolved === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      return resolved
    }

    // if we encounter a key not found symbol, it's an error unless the optional flag is true, which is used by
    // logical operators and expressions, as well as the optional suffix in FormatStringExpression.
    if (resolved === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
      if (optional) {
        return CONTEXT_RESOLVE_KEY_NOT_FOUND
      }

      throw new TemplateStringError({
        message: message || `Could not find key ${renderKeyPath(keyPath)}`,
        rawTemplateString,
        loc: this.loc,
      })
    }

    return resolved
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

  override evaluate(
    args: EvaluateArgs
  ):
    | CollectionOrValue<TemplatePrimitive>
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
    | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const functionArgs: CollectionOrValue<TemplatePrimitive>[] = []
    for (const functionArg of this.args) {
      const result = functionArg.evaluate(args)
      if (typeof result === "symbol") {
        return result
      }
      functionArgs.push(result)
    }

    const functionName = this.functionName.evaluate()

    const result: CollectionOrValue<TemplatePrimitive> = this.callHelperFunction({
      functionName,
      args: functionArgs,
      text: args.rawTemplateString,
      context: args.context,
      opts: args.opts,
    })

    return result
  }

  callHelperFunction({
    functionName,
    args,
    text,
  }: {
    functionName: string
    args: CollectionOrValue<TemplatePrimitive>[]
    text: string
    context: ConfigContext
    opts: ContextResolveOpts
  }): CollectionOrValue<TemplatePrimitive> {
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

    // Validate args
    let i = 0
    for (const [argName, schema] of Object.entries(spec.arguments)) {
      const value = args[i]
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
            message,
            rawTemplateString: text,
            loc,
          })
        }
      }

      args[i] = validateSchema(value, schema, {
        context: `argument '${argName}' for ${functionName} helper function`,
        ErrorClass: FunctionCallValidationError,
      })
      i++
    }

    try {
      return spec.fn(...args)
    } catch (error) {
      throw new TemplateStringError({
        message: `Error from helper function ${functionName}: ${error}`,
        rawTemplateString: text,
        loc: this.loc,
      })
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

  override evaluate(
    args: EvaluateArgs
  ):
    | CollectionOrValue<TemplatePrimitive>
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
    | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER {
    const conditionResult = this.condition.evaluate({
      ...args,
      optional: true,
    })

    if (conditionResult === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      return conditionResult
    }

    // evaluate ternary expression
    const evaluationResult =
      conditionResult !== CONTEXT_RESOLVE_KEY_NOT_FOUND && isTruthy(conditionResult)
        ? this.ifTrue.evaluate(args)
        : this.ifFalse.evaluate(args)

    return evaluationResult
  }
}