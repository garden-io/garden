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
import { GardenError, InternalError, TemplateStringError } from "../exceptions.js"
import { getHelperFunctions } from "./functions.js"
import { isTemplatePrimitive, type TemplatePrimitive } from "./types.js"
import type { Collection, CollectionOrValue } from "../util/objects.js"
import { type ConfigSource, validateSchema } from "../config/validation.js"
import type { TemplateExpressionGenerator } from "./static-analysis.js"

type EvaluateArgs = {
  context: ConfigContext
  opts: ContextResolveOpts
  yamlSource: ConfigSource

  /**
   * Whether or not to throw an error if ContextLookupExpression fails to resolve variable.
   * The FormatStringExpression will set this parameter based on wether the OptionalSuffix (?) is present or not.
   */
  optional?: boolean
}

export type TemplateStringSource = {
  rawTemplateString: string
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
  source: TemplateStringSource
}

export type TemplateEvaluationResult<T> =
  | T
  | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
  | typeof CONTEXT_RESOLVE_KEY_AVAILABLE_LATER

function* astVisitAll(e: TemplateExpression, source: ConfigSource): TemplateExpressionGenerator {
  for (const key in e) {
    if (key === "loc") {
      continue
    }
    const propertyValue = e[key]
    if (propertyValue instanceof TemplateExpression) {
      yield* astVisitAll(propertyValue, source)
      yield {
        value: propertyValue,
        yamlSource: source,
      }
    } else if (Array.isArray(propertyValue)) {
      for (const item of propertyValue) {
        if (item instanceof TemplateExpression) {
          yield* astVisitAll(item, source)
          yield {
            value: item,
            yamlSource: source,
          }
        }
      }
    }
  }
}

export abstract class TemplateExpression {
  constructor(public readonly loc: Location) {}

  *visitAll(source: ConfigSource): TemplateExpressionGenerator {
    yield* astVisitAll(this, source)
  }

  abstract evaluate(args: EvaluateArgs): TemplateEvaluationResult<CollectionOrValue<TemplatePrimitive>>
}

export class IdentifierExpression extends TemplateExpression {
  constructor(
    loc: Location,
    // in the template expression ${foo.123}, 123 is a valid identifier expression and is treated as a number.
    public readonly identifier: string | number
  ) {
    if (!isString(identifier) && !isNumber(identifier)) {
      throw new InternalError({
        message: `identifier arg for IdentifierExpression must be a string or number. Got: ${typeof identifier}`,
      })
    }
    super(loc)
  }

  override evaluate(): string | number {
    return this.identifier
  }
}

export class LiteralExpression extends TemplateExpression {
  constructor(
    loc: Location,
    public readonly literal: TemplatePrimitive
  ) {
    super(loc)
  }

  override evaluate(): TemplatePrimitive {
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

  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
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

  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<TemplatePrimitive> {
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

export function isNotFound(
  v:
    | CollectionOrValue<TemplatePrimitive>
    // CONTEXT_RESOLVE_KEY_AVAILABLE_LATER is not included here on purpose, because it must always be handled separately by returning early.
    | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
): v is typeof CONTEXT_RESOLVE_KEY_NOT_FOUND {
  return v === CONTEXT_RESOLVE_KEY_NOT_FOUND
}

export function isTruthy(v: CollectionOrValue<TemplatePrimitive>): boolean {
  if (isTemplatePrimitive(v)) {
    return !!v
  }

  // collections are truthy, regardless wether they are empty or not.
  v satisfies Collection<TemplatePrimitive>
  return true
}

export class LogicalOrExpression extends LogicalExpression {
  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const left = this.left.evaluate({
      ...args,
      optional: true,
    })

    if (left === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      // If key might be available later, we can't decide which branch to take in the logical expression yet.
      return left
    }

    if (!isNotFound(left) && isTruthy(left)) {
      return left
    }

    return this.right.evaluate(args)
  }
}

export class LogicalAndExpression extends LogicalExpression {
  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const left = this.left.evaluate({
      ...args,
      optional: true,
    })

    if (left === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      // If key might be available later, we can't decide which branch to take in the logical expression yet.
      return left
    }

    // We return false in case the variable could not be resolved. This is a quirk of Garden's template language that we want to keep for backwards compatibility.
    if (isNotFound(left)) {
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

    if (isNotFound(right)) {
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

  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const left = this.left.evaluate(args)

    if (typeof left === "symbol") {
      return left
    }

    const right = this.right.evaluate(args)

    if (typeof right === "symbol") {
      return right
    }

    return this.transform(left, right, args)
  }

  abstract transform(
    left: CollectionOrValue<TemplatePrimitive>,
    right: CollectionOrValue<TemplatePrimitive>,
    params: EvaluateArgs
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
    { yamlSource }: EvaluateArgs
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
        loc: this.loc,
        yamlSource,
      })
    }
  }
}

export class ContainsExpression extends BinaryExpression {
  override transform(
    collection: CollectionOrValue<TemplatePrimitive>,
    element: CollectionOrValue<TemplatePrimitive>,
    { yamlSource }: EvaluateArgs
  ): boolean {
    if (!isTemplatePrimitive(element)) {
      throw new TemplateStringError({
        message: `The right-hand side of a 'contains' operator must be a string, number, boolean or null (got ${typeof element}).`,
        loc: this.loc,
        yamlSource,
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
      loc: this.loc,
      yamlSource,
    })
  }
}

export abstract class BinaryExpressionOnNumbers extends BinaryExpression {
  override transform(
    left: CollectionOrValue<TemplatePrimitive>,
    right: CollectionOrValue<TemplatePrimitive>,
    { yamlSource }: EvaluateArgs
  ): CollectionOrValue<TemplatePrimitive> {
    // All other operators require numbers to make sense (we're not gonna allow random JS weirdness)
    if (!isNumber(left) || !isNumber(right)) {
      throw new TemplateStringError({
        message: `Both terms need to be numbers for ${
          this.operator
        } operator (got ${typeof left} and ${typeof right}).`,
        loc: this.loc,
        yamlSource,
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

  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const result = this.innerExpression.evaluate({
      ...args,
      optional: args.optional || this.isOptional,
    })

    // Only if this expression is optional we return undefined instead of symbol.
    // If merely optional is true in EvaluateArgs, we must return symbol.
    if (this.isOptional && result === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
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

  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
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

  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<string> {
    let result: string = ""

    for (const expr of this.expressions) {
      const r = expr.evaluate(args)

      if (typeof r === "symbol") {
        return r
      }

      if (r === undefined) {
        continue
      }

      // Calls toString when encountering non-primitives like objects or arrays.
      result += `${r}`
    }

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

  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<string | number> {
    const inner = this.innerExpression.evaluate(args)

    if (typeof inner === "symbol") {
      return inner
    }

    if (typeof inner !== "string" && typeof inner !== "number") {
      throw new TemplateStringError({
        message: `Expression in brackets must resolve to a string or number (got ${typeof inner}).`,
        loc: this.loc,
        yamlSource: args.yamlSource,
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
    yamlSource,
  }: EvaluateArgs): TemplateEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const keyPath: (string | number)[] = []
    for (const k of this.keyPath) {
      const evaluated = k.evaluate({ context, opts, optional, yamlSource })
      if (typeof evaluated === "symbol") {
        return evaluated
      }
      keyPath.push(evaluated)
    }

    const { resolved, getUnavailableReason } = this.resolveContext(context, keyPath, opts, yamlSource)

    if ((opts.allowPartial || opts.allowPartialContext) && resolved === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      return resolved
    }

    // if we encounter a key not found symbol, it's an error unless the optional flag is true, which is used by
    // logical operators and expressions, as well as the optional suffix in FormatStringExpression.
    if (typeof resolved === "symbol") {
      if (optional) {
        return CONTEXT_RESOLVE_KEY_NOT_FOUND
      }

      throw new TemplateStringError({
        message: getUnavailableReason?.() || `Could not find key ${renderKeyPath(keyPath)}`,
        loc: this.loc,
        yamlSource,
      })
    }

    return resolved
  }

  private resolveContext(
    context: ConfigContext,
    keyPath: (string | number)[],
    opts: ContextResolveOpts,
    yamlSource: ConfigSource
  ) {
    try {
      return context.resolve({
        key: keyPath,
        nodePath: [],
        // TODO: freeze opts object instead of using shallow copy
        opts: {
          ...opts,
        },
      })
    } catch (e) {
      if (e instanceof TemplateStringError) {
        throw new TemplateStringError({ message: e.originalMessage, loc: this.loc, yamlSource })
      }
      if (e instanceof GardenError) {
        throw new TemplateStringError({ message: e.message, loc: this.loc, yamlSource })
      }
      throw e
    }
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

  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
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
      functionName: functionName.toString(),
      args: functionArgs,
      yamlSource: args.yamlSource,
    })

    return result
  }

  callHelperFunction({
    functionName,
    args,
    yamlSource,
  }: {
    functionName: string
    yamlSource: ConfigSource
    args: CollectionOrValue<TemplatePrimitive>[]
  }): CollectionOrValue<TemplatePrimitive> {
    const helperFunctions = getHelperFunctions()
    const spec = helperFunctions[functionName]

    if (!spec) {
      const availableFns = Object.keys(helperFunctions).join(", ")
      throw new TemplateStringError({
        message: `Could not find helper function '${functionName}'. Available helper functions: ${availableFns}`,
        loc: this.loc,
        yamlSource,
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
          loc: this.loc,
          yamlSource,
        })
      }

      const loc = this.loc

      class FunctionCallValidationError extends TemplateStringError {
        constructor({ message }: { message: string }) {
          super({
            message,
            loc,
            yamlSource,
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
        yamlSource,
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

  override evaluate(args: EvaluateArgs): TemplateEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const conditionResult = this.condition.evaluate({
      ...args,
      optional: true,
    })

    if (conditionResult === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
      return conditionResult
    }

    // evaluate ternary expression
    const evaluationResult =
      !isNotFound(conditionResult) && isTruthy(conditionResult)
        ? this.ifTrue.evaluate(args)
        : this.ifFalse.evaluate(args)

    return evaluationResult
  }
}
