/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray, isNumber, isString } from "lodash-es"
import { ContextResolveError, getUnavailableReason, renderKeyPath } from "../config/template-contexts/base.js"
import { InternalError } from "../exceptions.js"
import { getHelperFunctions } from "./functions/index.js"
import type { EvaluateTemplateArgs } from "./types.js"
import { isTemplatePrimitive, type TemplatePrimitive } from "./types.js"
import type { Collection, CollectionOrValue } from "../util/objects.js"
import { type ConfigSource, validateSchema } from "../config/validation.js"
import type { TemplateExpressionGenerator } from "./analysis.js"
import { TemplateStringError } from "./errors.js"
import { styles } from "../logger/styles.js"

type ASTEvaluateArgs = EvaluateTemplateArgs & {
  yamlSource: ConfigSource

  /**
   * Whether or not to throw an error if ContextLookupExpression fails to resolve variable.
   * The FormatStringExpression will set this parameter based on wether the OptionalSuffix (?) is present or not.
   */
  readonly optional?: boolean
}

export const CONTEXT_RESOLVE_KEY_NOT_FOUND: unique symbol = Symbol.for("ContextResolveKeyNotFound")
export type ContextResolveKeyNotFound = typeof CONTEXT_RESOLVE_KEY_NOT_FOUND

export type ASTEvaluationResult<T> = T | ContextResolveKeyNotFound

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

function* astVisitAll(e: TemplateExpression, source: ConfigSource): TemplateExpressionGenerator {
  for (const key in e) {
    if (key === "loc") {
      continue
    }
    const propertyValue = e[key]
    if (propertyValue instanceof TemplateExpression) {
      yield* astVisitAll(propertyValue, source)
      yield {
        type: "template-expression",
        value: propertyValue,
        yamlSource: source,
      }
    } else if (Array.isArray(propertyValue)) {
      for (const item of propertyValue) {
        if (item instanceof TemplateExpression) {
          yield* astVisitAll(item, source)
          yield {
            type: "template-expression",
            value: item,
            yamlSource: source,
          }
        }
      }
    }
  }
}

export abstract class TemplateExpression {
  public abstract readonly rawText: string
  public abstract readonly loc: Location;

  *visitAll(source: ConfigSource): TemplateExpressionGenerator {
    yield* astVisitAll(this, source)
  }

  abstract evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>>
}

export class IdentifierExpression extends TemplateExpression {
  constructor(
    public readonly rawText: string,
    public readonly loc: Location,
    // in the template expression ${foo.123}, 123 is a valid identifier expression and is treated as a number.
    public readonly identifier: string | number
  ) {
    if (!isString(identifier) && !isNumber(identifier)) {
      throw new InternalError({
        message: `identifier arg for IdentifierExpression must be a string or number. Got: ${typeof identifier}`,
      })
    }
    super()
  }

  override evaluate(): string | number {
    return this.identifier
  }
}

export class LiteralExpression extends TemplateExpression {
  constructor(
    public readonly rawText: string,
    public readonly loc: Location,
    public readonly literal: TemplatePrimitive
  ) {
    super()
  }

  override evaluate(): TemplatePrimitive {
    return this.literal
  }
}

export class ArrayLiteralExpression extends TemplateExpression {
  constructor(
    public readonly rawText: string,
    public readonly loc: Location,
    // an ArrayLiteralExpression consists of several template expressions,
    // for example other literal expressions and context lookup expressions.
    public readonly literal: TemplateExpression[]
  ) {
    super()
  }

  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
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
    public readonly rawText: string,
    public readonly loc: Location,
    public readonly innerExpression: TemplateExpression
  ) {
    super()
  }

  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<TemplatePrimitive> {
    const inner = this.innerExpression.evaluate({
      ...args,
      // For backwards compatibility with older versions of Garden, unary expressions do not throw errors if context lookup expressions fail.
      // `!var.doesNotExist` evaluates to false and `typeof var.doesNotExist` evaluates to the string "undefined".
      // TODO(0.14): Remove the following line. other methods exist to make variables optional, for example using the logical or operator.
      optional: true,
    })

    // if (inner === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
    //   return inner
    // }

    return this.transform(inner)
  }

  abstract transform(
    value: CollectionOrValue<TemplatePrimitive> | ContextResolveKeyNotFound
  ): TemplatePrimitive | ContextResolveKeyNotFound
}

export class TypeofExpression extends UnaryExpression {
  override transform(
    value: CollectionOrValue<TemplatePrimitive> | ContextResolveKeyNotFound
  ): string | ContextResolveKeyNotFound {
    if (isNotFound(value)) {
      return "undefined"
    }
    return typeof value
  }
}

export class NotExpression extends UnaryExpression {
  override transform(
    value: CollectionOrValue<TemplatePrimitive> | ContextResolveKeyNotFound
  ): boolean | ContextResolveKeyNotFound {
    if (isNotFound(value)) {
      return true
    }
    return !value
  }
}

export abstract class LogicalExpression extends TemplateExpression {
  constructor(
    public readonly rawText: string,
    public readonly loc: Location,
    public readonly operator: string,
    public readonly left: TemplateExpression,
    public readonly right: TemplateExpression
  ) {
    super()
  }
}

export function isNotFound(
  v:
    | CollectionOrValue<TemplatePrimitive>
    // CONTEXT_RESOLVE_KEY_AVAILABLE_LATER is not included here on purpose, because it must always be handled separately by returning early.
    | ContextResolveKeyNotFound
): v is ContextResolveKeyNotFound {
  return v === CONTEXT_RESOLVE_KEY_NOT_FOUND
}

export function isTruthy(v: TemplatePrimitive | Collection<unknown>): boolean {
  if (isTemplatePrimitive(v)) {
    return !!v
  }

  // collections are truthy, regardless wether they are empty or not.
  v satisfies Collection<unknown>
  return true
}

export class LogicalOrExpression extends LogicalExpression {
  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const left = this.left.evaluate({
      ...args,
      optional: true,
    })

    // if (left === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
    //   // If key might be available later, we can't decide which branch to take in the logical expression yet.
    //   return left
    // }

    if (!isNotFound(left) && isTruthy(left)) {
      return left
    }

    return this.right.evaluate(args)
  }
}

export class LogicalAndExpression extends LogicalExpression {
  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const left = this.left.evaluate({
      ...args,
      optional: true,
    })

    // if (left === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
    //   // If key might be available later, we can't decide which branch to take in the logical expression yet.
    //   return left
    // }

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

    // if (right === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
    //   // If key might be available later, we can't decide on a final value yet and the logical expression needs to be reevaluated later.
    //   return right
    // }

    if (isNotFound(right)) {
      return false
    }

    return right
  }
}

export abstract class BinaryExpression extends TemplateExpression {
  constructor(
    public readonly rawText: string,
    public readonly loc: Location,
    public readonly operator: string,
    public readonly left: TemplateExpression,
    public readonly right: TemplateExpression
  ) {
    super()
  }

  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
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
    params: ASTEvaluateArgs
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
    { yamlSource }: ASTEvaluateArgs
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
    { yamlSource }: ASTEvaluateArgs
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
    { yamlSource }: ASTEvaluateArgs
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
    public readonly rawText: string,
    public readonly loc: Location,
    public readonly innerExpression: TemplateExpression,
    public readonly isOptional: boolean
  ) {
    super()
  }

  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const result = this.innerExpression.evaluate({
      ...args,
      opts: {
        ...args.opts,
        // nested expressions should never be partially resolved in legacy mode
        // Otherwise, weird problems can happen if we e.g. partially resolve a sub-expression and pass it to a parameter of a function call.
        // TODO(0.14): remove legacyAllowPartial
        legacyAllowPartial: false,
      },
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

export abstract class AbstractBlockExpression extends TemplateExpression {
  // this is a method because visitAll is confused if multiple properties contain the same expression
  protected abstract getExpressions(): TemplateExpression[]

  override get rawText(): string {
    return this.getExpressions()
      .map((expr) => expr.rawText || "")
      .join("")
  }

  override get loc(): Location {
    const expressions = this.getExpressions()
    const first = expressions[0]!
    const last = expressions[expressions.length - 1]!

    return {
      start: first.loc.start,
      end: last.loc.end,
      source: first.loc.source,
    }
  }
}

export class BlockExpression extends AbstractBlockExpression {
  public readonly expressions: TemplateExpression[]

  constructor(...expressions: TemplateExpression[]) {
    super()
    if (expressions.length === 0) {
      throw new InternalError({
        message: "Compound expression must consist of at least one expression",
      })
    }
    this.expressions = expressions
  }

  protected override getExpressions(): TemplateExpression[] {
    return this.expressions
  }

  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const legacyAllowPartial = args.opts.legacyAllowPartial

    let result: string = ""
    for (const expr of this.expressions) {
      const r = expr.evaluate({
        ...args,
        // in legacyAllowPartial mode, all template expressions are optional
        optional: args.optional || legacyAllowPartial,
      })

      // For legacy allow partial mode, other format string expressions might be evaluated, and
      // we produce a string even when a key hasn't been found.
      // This is extremely evil, but unfortunately needs to be kept for backwards bug-compatibility.
      // TODO(0.14): please remove legacyAllowPartial
      if (legacyAllowPartial && typeof r === "symbol") {
        result += expr.rawText
        continue
      } else if (this.expressions.length === 1) {
        // if we evaluate a single expression we are allowed to evaluate to something other than a string
        return r
      }

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

export class IfBlockExpression extends AbstractBlockExpression {
  // `buildConditionalTree` in parser.pegjs will fill these in
  public consequent: TemplateExpression | undefined
  public else: ElseBlockExpression | undefined
  public alternate: TemplateExpression | undefined
  public endIf: EndIfBlockExpression | undefined

  constructor(public readonly condition: FormatStringExpression) {
    if (!(condition instanceof FormatStringExpression)) {
      throw new InternalError({
        message: "expected if block condition to be FormatStringExpression",
      })
    }
    super()
  }

  protected override getExpressions(): TemplateExpression[] {
    return [this.condition, this.consequent, this.else, this.alternate, this.endIf].filter(
      (e): e is TemplateExpression => !!e
    )
  }

  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const condition = this.condition.evaluate(args)

    if (typeof condition === "symbol") {
      return condition
    }

    // For backwards compatibility, we do allow if block expressions without endif block in some cases.
    // For a stand-alone if-block expression, we evaluate the condition and return the result.
    if (this.consequent === undefined) {
      return condition
    }

    const evaluated = isTruthy(condition) ? this.consequent?.evaluate(args) : this.alternate?.evaluate(args)

    return evaluated
  }
}

export class ElseBlockExpression extends TemplateExpression {
  constructor(
    public readonly rawText: string,
    public readonly loc: Location
  ) {
    super()
  }

  override evaluate(): never {
    // See also `ast.IfBlockExpression` and `buildConditionalTree` in `parser.pegjs`
    throw new InternalError({
      message: `{else} block expression should never be evaluated`,
    })
  }
}

export class EndIfBlockExpression extends TemplateExpression {
  constructor(
    public readonly rawText: string,
    public readonly loc: Location
  ) {
    super()
  }

  override evaluate(): never {
    // See also `ast.IfBlockExpression` and `buildConditionalTree` in `parser.pegjs`
    throw new InternalError({
      message: `{endif} block expression should should never be evaluated`,
    })
  }
}

export class MemberExpression extends TemplateExpression {
  constructor(
    public readonly rawText: string,
    public readonly loc: Location,
    public readonly innerExpression: TemplateExpression
  ) {
    super()
  }

  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<string | number> {
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
    public readonly rawText: string,
    public readonly loc: Location,
    public readonly keyPath: (IdentifierExpression | MemberExpression)[]
  ) {
    super()
  }

  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const keyPath: (string | number)[] = []
    for (const k of this.keyPath) {
      const evaluated = k.evaluate(args)
      if (typeof evaluated === "symbol") {
        return evaluated
      }
      keyPath.push(evaluated)
    }

    const result = this.lookup(keyPath, args)

    // if we encounter a key that could not be found, it's an error unless the optional flag is true, which is used by
    // logical operators and expressions, as well as the optional suffix in FormatStringExpression.
    if (!result.found) {
      const { optional, yamlSource } = args

      if (optional) {
        return CONTEXT_RESOLVE_KEY_NOT_FOUND
      }

      throw new TemplateStringError({
        message: getUnavailableReason(result),
        loc: this.loc,
        yamlSource,
        lookupResult: result,
      })
    }

    return result.resolved
  }

  private lookup(keyPath: (string | number)[], { context, opts, yamlSource }: ASTEvaluateArgs) {
    try {
      return context.resolve({
        nodePath: [],
        key: keyPath,
        // TODO: freeze opts object instead of using shallow copy
        opts: {
          ...opts,
        },
      })
    } catch (e) {
      if (e instanceof ContextResolveError) {
        throw new TemplateStringError({
          message: e.message,
          loc: this.loc,
          yamlSource,
          wrappedErrors: [e],
        })
      }
      if (e instanceof TemplateStringError) {
        throw new TemplateStringError({
          message: `Failed to evaluate template expression at ${styles.highlight(renderKeyPath(keyPath))}: ${e.message}`,
          loc: this.loc,
          yamlSource,
          wrappedErrors: [e],
        })
      }
      throw e
    }
  }
}

export class FunctionCallExpression extends TemplateExpression {
  constructor(
    public readonly rawText: string,
    public readonly loc: Location,
    public readonly functionName: IdentifierExpression,
    public readonly args: TemplateExpression[]
  ) {
    super()
  }

  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
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
    public readonly rawText: string,
    public readonly loc: Location,
    public readonly condition: TemplateExpression,
    public readonly consequent: TemplateExpression,
    public readonly alternate: TemplateExpression
  ) {
    super()
  }

  override evaluate(args: ASTEvaluateArgs): ASTEvaluationResult<CollectionOrValue<TemplatePrimitive>> {
    const conditionResult = this.condition.evaluate({
      ...args,
      optional: true,
    })

    // if (conditionResult === CONTEXT_RESOLVE_KEY_AVAILABLE_LATER) {
    //   return conditionResult
    // }

    // evaluate ternary expression
    const evaluationResult =
      !isNotFound(conditionResult) && isTruthy(conditionResult)
        ? this.consequent.evaluate(args)
        : this.alternate.evaluate(args)

    return evaluationResult
  }
}
