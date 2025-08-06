/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { ConfigurationError, GardenError, InternalError } from "../../exceptions.js"
import type { CustomObjectSchema } from "../common.js"
import { joi, joiIdentifier } from "../common.js"
import { Profile } from "../../util/profiling.js"
import { deepMap, type Collection, type CollectionOrValue } from "../../util/objects.js"
import type { ParsedTemplate, ParsedTemplateValue, ResolvedTemplate } from "../../template/types.js"
import { isTemplatePrimitive, UnresolvedTemplateValue } from "../../template/types.js"
import merge from "lodash-es/merge.js"
import omitBy from "lodash-es/omitBy.js"
import { flatten, isEqual, isString, uniq } from "lodash-es"
import { isMap } from "util/types"
import { deline } from "../../util/string.js"
import { styles } from "../../logger/styles.js"
import type { ContextLookupReferenceFinding } from "../../template/analysis.js"
import { TemplateStringError } from "../../template/errors.js"

export type ContextKeySegment = string | number
export type ContextKey = ContextKeySegment[]

export interface ContextResolveOpts {
  /**
   * When explicitly set to true, this will ensure that escaped template strings
   * like $${foo.bar} will be kept as-is. This is useful when the intent to parse
   * the result again. We use this technique in the `ModuleResolver`.
   *
   * @default false
   * @deprecated
   */
  keepEscapingInTemplateStrings?: boolean

  /**
   * If true, the given context is final and contains everything needed to fully resolve the given templates.
   *
   * If false, this flag enables special behaviour of for some template values, like `ObjectSpreadLazyValue`,
   * where we basically ignore unresolvable templates and resolve to whatever is available at the moment.
   *
   * This is currently used in the `VariableContext`, to allow for using some of the variables early during action processing,
   * before we built the actual graph.
   *
   * @example
   *  kind: Build
   *  name: xy
   *  dependencies: ${var.dependencies} // <-- if false, we can resolve 'var.dependencies' despite the fact that 'actions' context is missing
   *  variables:
   *    $merge: ${actions.build.foo.vars} // <-- if true, the $merge operation fails if 'actions' context is missing
   *    dependencies: ["bar"]
   *
   * @warning If set to false, templates can lose information; Be careful when persisting the resolved values, because
   * we may have lost some information even if evaluate returned `partial: false`.
   *
   * @default true
   */
  isFinalContext?: boolean

  // for detecting circular references
  stack?: string[]
}

export interface ContextResolveParams {
  /**
   * Key path to look up in the context.
   */
  key: ContextKey

  /**
   * If the context was nested in another context, the key path that led to the inner context.
   */
  nodePath: ContextKey

  /**
   * Context lookup options (Deprecated; These mostly affect template string evaluation)
   */
  opts: ContextResolveOpts

  /**
   * The context to be used when evaluating encountered instances of `UnresolvedTemplateValue`.
   */
  rootContext?: ConfigContext
}

export type ContextResolveOutputNotFound = {
  found: false
  /**
   * @example
   * {
   *  reason: "key_not_found",
   *  key: "foo"
   *  keyPath: ["var"], // var does not have a key foo
   * }
   */
  explanation: {
    reason: "key_not_found" | "circular_reference"
    key: string | number
    keyPath: (string | number)[]
    getAvailableKeys: () => (string | number)[]
    getFooterMessage?: () => string
  }
}

export type ContextResolveOutput<T = ResolvedTemplate> =
  | {
      found: true
      resolved: T
    }
  | ContextResolveOutputNotFound

export function schema(joiSchema: Joi.Schema) {
  return (target: any, propName: string) => {
    target.constructor._schemas = { ...(target.constructor._schemas || {}), [propName]: joiSchema }
  }
}

export interface ConfigContextType {
  new (...params: any[]): ContextWithSchema

  getSchema(): CustomObjectSchema
}

let globalConfigContextCounter: number = 0

// Note: we're using classes here to be able to use decorators to describe each context node and key
@Profile()
export abstract class ConfigContext {
  private readonly _cache: Map<string, ContextResolveOutput>
  private readonly _id: number

  constructor(public readonly _description: string) {
    this._id = globalConfigContextCounter++
    this._cache = new Map()
    if (!_description) {
      this._description = ""
    }
  }

  public toSanitizedValue() {
    return `<${this.constructor.name}(${this._description})>`
  }

  protected clearCache() {
    this._cache.clear()
  }

  private detectCircularReference({ nodePath, key, opts }: ContextResolveParams) {
    const plainKey = renderKeyPath(key)
    const keyStr = `${this.constructor.name}(${this._id})-${plainKey}`
    if (opts.stack?.includes(keyStr)) {
      throw new ContextCircularlyReferencesItself({
        message: `Circular reference detected when resolving key ${styles.highlight(renderKeyPath([...nodePath, ...key]))}`,
      })
    }
    return keyStr
  }

  protected abstract resolveImpl(params: ContextResolveParams): ContextResolveOutput

  public resolve(params: ContextResolveParams): ContextResolveOutput {
    const key = this.detectCircularReference(params)
    if (!params.opts.stack) {
      params.opts.stack = [key]
    } else {
      params.opts.stack.push(key)
    }

    try {
      let res = this._cache.get(key)
      if (res) {
        return res
      }
      res = this.resolveImpl(params)
      if (res.found) {
        this._cache.set(key, res)
        return res
      }
      return {
        found: false,
        explanation: {
          ...res.explanation,
          getFooterMessage: () => {
            const previousMsg = res.explanation.getFooterMessage?.()
            const msg = this.getMissingKeyErrorFooter(params)
            if (previousMsg) {
              return `${previousMsg}\n${msg}`
            }
            return msg
          },
        },
      }
    } finally {
      params.opts.stack.pop()
    }
  }

  /**
   * Override this method to add more context to error messages thrown in the `resolve` method when a missing key is
   * referenced.
   */
  protected getMissingKeyErrorFooter(_params: ContextResolveParams): string {
    return ""
  }
}

// Note: we're using classes here to be able to use decorators to describe each context node and key
@Profile()
export abstract class ContextWithSchema extends ConfigContext {
  constructor(description: string = "") {
    super(description)
  }

  static getSchema() {
    const schemas = (<any>this)._schemas
    return joi.object().keys(schemas).required()
  }

  public hasReferenceRoot(ref: ContextLookupReferenceFinding): boolean {
    return isString(ref.keyPath[0]) && this[ref.keyPath[0]] !== undefined
  }

  protected override resolveImpl(params: ContextResolveParams): ContextResolveOutput {
    return traverseContext(
      omitBy(this, (key) => typeof key === "string" && key.startsWith("_")) as CollectionOrValue<
        ParsedTemplate | ConfigContext
      >,
      { ...params, rootContext: params.rootContext || this }
    )
  }
}

/**
 * A generic context that just wraps an object.
 */
export class GenericContext extends ConfigContext {
  constructor(
    description: string,
    protected readonly data: ParsedTemplate | Collection<ParsedTemplate | ConfigContext>
  ) {
    if (data === undefined) {
      throw new InternalError({
        message: "Generic context may not be undefined.",
      })
    }
    if (data instanceof ContextWithSchema) {
      throw new InternalError({
        message:
          "Generic context is useless when instantiated with just another context as parameter. Use the other context directly instead.",
      })
    }
    super(description)
  }

  protected override resolveImpl(params: ContextResolveParams): ContextResolveOutput {
    return traverseContext(this.data, { ...params, rootContext: params.rootContext || this })
  }
}

export class EnvironmentContext extends ContextWithSchema {
  @schema(
    joi
      .string()
      .required()
      .description("The name of the environment Garden is running against, excluding the namespace.")
      .example("local")
  )
  public readonly name: string

  @schema(
    joi
      .string()
      .required()
      .description("The full name of the environment Garden is running against, including the namespace.")
      .example("my-namespace.local")
  )
  public readonly fullName: string

  @schema(joi.string().description("The currently active namespace (if any).").example("my-namespace"))
  public readonly namespace: string

  constructor(name: string, fullName: string, namespace?: string) {
    super()
    this.name = name
    this.fullName = fullName
    this.namespace = namespace || ""
  }
}

/**
 * Used to throw a specific error, e.g. when a module attempts to reference itself.
 */
export class ErrorContext extends ConfigContext {
  constructor(private readonly message: string) {
    super(`error`)
  }

  protected override resolveImpl({}): ContextResolveOutput {
    throw new ConfigurationError({ message: this.message })
  }
}

export class ParentContext extends ContextWithSchema {
  @schema(joiIdentifier().description(`The name of the parent config.`))
  public readonly name: string

  constructor(name: string) {
    super()
    this.name = name
  }
}

export class TemplateContext extends ContextWithSchema {
  @schema(joiIdentifier().description(`The name of the template.`))
  public readonly name: string

  constructor(name: string) {
    super()
    this.name = name
  }
}

/**
 * Given all the segments of a template string, return a string path for the key.
 */
export function renderKeyPath(key: ContextKeySegment[]): string {
  // Note: We don't support bracket notation for the first part in a template string
  if (key.length === 0) {
    return ""
  }
  const stringSegments = key.map((segment) => "" + segment)
  return (
    stringSegments
      .slice(1)
      // Need to correctly handle key segments with dots in them, and nested templates
      .reduce((output, segment) => {
        if (segment.match(/[\.\$\{\}]/)) {
          return `${output}[${JSON.stringify(segment)}]`
        } else {
          return `${output}.${segment}`
        }
      }, stringSegments[0])
  )
}

export class LayeredContext extends ConfigContext {
  protected readonly layers: ConfigContext[]

  constructor(description: string, ...layers: ConfigContext[]) {
    super(description)
    if (layers.length === 0) {
      this.layers = [new GenericContext("empty", {})]
    } else {
      this.layers = layers
    }
  }

  public addLayer(layer: ConfigContext) {
    this.layers.push(layer)
    this.clearCache()
  }

  override resolveImpl(args: ContextResolveParams): ContextResolveOutput {
    const layeredItems: ContextResolveOutput[] = []

    for (const context of this.layers.toReversed()) {
      const resolved = context.resolve(args)

      if (resolved.found) {
        if (isTemplatePrimitive(resolved.resolved)) {
          return resolved
        }
      }

      layeredItems.push(resolved)
    }

    // if it could not be found in any context, aggregate error information from all contexts
    if (layeredItems.every((res) => !res.found)) {
      // find deepest key path (most specific error)
      let deepestKeyPath: (number | string)[] = []
      for (const res of layeredItems) {
        if (res.explanation.keyPath.length > deepestKeyPath.length) {
          deepestKeyPath = res.explanation.keyPath
        }
      }

      // identify all errors with the same key path
      const all = layeredItems.filter((res) => isEqual(res.explanation.keyPath, deepestKeyPath))
      const lastError = all[all.length - 1]

      return {
        ...lastError,
        explanation: {
          ...lastError.explanation,
          getAvailableKeys: () => uniq(flatten(all.map((res) => res.explanation.getAvailableKeys()))),
        },
      }
    }

    const returnValue = {}

    // Here we need to reverse the layers again, because we apply merge function
    // that merges the right operand into the left one.
    for (const i of layeredItems.toReversed()) {
      if (!i.found) {
        continue
      }

      merge(returnValue, { resolved: i.resolved })
    }

    return {
      found: true,
      resolved: returnValue["resolved"],
    }
  }
}

export abstract class ContextResolveError extends GardenError {
  type = "context-resolve"
}

/**
 * Occurs when looking up a key in a context turns out to be circular.
 */
export class ContextCircularlyReferencesItself extends ContextResolveError {}

/**
 * Occurs when attempting to look up a key on primitive values.
 */
export class ContextLookupNotIndexable extends ContextResolveError {}

function traverseContext(
  value: CollectionOrValue<ConfigContext | ParsedTemplateValue>,
  params: ContextResolveParams & { rootContext: ConfigContext }
): ContextResolveOutput {
  const rootContext = params.rootContext

  if (value instanceof UnresolvedTemplateValue) {
    const res = evaluateAndHandleCircularReferences({
      rootContext,
      opts: params.opts,
      value,
      key: params.key[0],
      keyPath: params.nodePath,
      getAvailableKeys: () => [],
    })
    if (!res.found) {
      return res
    }
    return traverseContext(res.resolved, params)
  }

  if (value instanceof ConfigContext) {
    const evaluated = value.resolve(params)
    // no need to recurse, as the nested context took care of recursing if needed
    return evaluated
  }

  const keyPath = params.key
  if (keyPath.length > 0) {
    const nextKey = params.key[0]

    if (isTemplatePrimitive(value)) {
      throw new ContextLookupNotIndexable({
        message: `Attempted to look up key ${nextKey} on primitive value ${renderKeyPath([...params.nodePath, ...params.key])}.`,
      })
    }

    const remainder = params.key.slice(1)

    let nextValue: CollectionOrValue<ConfigContext | ParsedTemplateValue>
    let getAvailableKeys: () => (string | number)[]
    if (isMap(value)) {
      nextValue = value.get(nextKey) as CollectionOrValue<ConfigContext | ParsedTemplateValue>
      getAvailableKeys = () =>
        Array.from(value.keys())
          .filter((k) => typeof k === "string" || typeof k === "number")
          .filter((k) => k !== nextKey)
    } else {
      nextValue = value[nextKey]
      getAvailableKeys = () => Object.keys(value).filter((k) => !k.startsWith("_") && k !== nextKey)
    }

    if (nextValue === undefined) {
      return {
        found: false,
        explanation: {
          reason: "key_not_found",
          key: nextKey,
          keyPath: params.nodePath,
          getAvailableKeys,
        },
      }
    }

    if (nextValue instanceof UnresolvedTemplateValue) {
      const res = evaluateAndHandleCircularReferences({
        rootContext,
        opts: params.opts,
        value: nextValue,
        key: nextKey,
        keyPath: params.nodePath,
        getAvailableKeys,
      })
      if (!res.found) {
        return res
      }
      nextValue = res.resolved
    }

    const nodePath = [...params.nodePath, nextKey]
    return traverseContext(nextValue, {
      ...params,
      nodePath,
      key: remainder,
    })
  }

  // from now on we handle the case when keyPath.length === 0

  if (isTemplatePrimitive(value)) {
    return {
      found: true,
      resolved: value,
    }
  }

  const notFoundValues: ContextResolveOutputNotFound[] = []

  // we are handling the case here, where the user looks up a collection of context keys, e.g. ${YAMLEncode(var)}
  const resolved = deepMap(value, (v, _, deepMapKeyPath) => {
    const innerTraverseParams = {
      ...params,
      nodePath: [...params.nodePath, ...deepMapKeyPath],
      // we ask nested values to be fully resolved recursively
      key: [],
    }
    if (v instanceof UnresolvedTemplateValue || v instanceof ConfigContext) {
      const res = traverseContext(v, innerTraverseParams)

      if (res.found) {
        return res.resolved
      }

      notFoundValues.push(res)

      return undefined
    }

    return v
  })

  if (notFoundValues.length > 0) {
    return notFoundValues[0]
  }

  return {
    found: true,
    resolved,
  }
}

function evaluateAndHandleCircularReferences({
  rootContext,
  opts,
  value,
  key,
  keyPath,
  getAvailableKeys,
}: {
  rootContext: ConfigContext
  opts: ContextResolveOpts
  value: UnresolvedTemplateValue
  key: string | number
  keyPath: (string | number)[]
  getAvailableKeys: () => (string | number)[]
}): { found: true; resolved: ParsedTemplate } | ContextResolveOutputNotFound {
  try {
    return {
      found: true,
      resolved: value.evaluate({ context: rootContext, opts }).resolved,
    }
  } catch (e) {
    // We return found=false instead of throwing to allow for backwards compatibility
    // Older versions of garden didn't allow cross-references peer variables defined in the same scope
    // This meant that the template `variables: { foo: "${var.foo}" }` was perfectly valid, and `var.foo`
    // simply references the declaration in the parent scope (e.g. project-level vars), rather than itself.
    // This means we need to treat circular references as if we didn't find the value, to preserve compatibility with such template code.
    if (
      e instanceof ContextCircularlyReferencesItself ||
      (e instanceof TemplateStringError && e.causedByCircularReferenceError)
    ) {
      return {
        found: false,
        explanation: {
          reason: "circular_reference",
          key,
          keyPath,
          getAvailableKeys,
        },
      }
    }
    throw e
  }
}

export function getUnavailableReason(result: ContextResolveOutput): string {
  if (result.found) {
    throw new InternalError({
      message: "called getUnavailableReason on key where found=true",
    })
  }

  const available = result.explanation.getAvailableKeys()

  const message = deline`
    Could not find key ${styles.highlight(result.explanation.key)}${result.explanation.keyPath.length > 0 ? ` under ${styles.highlight(renderKeyPath(result.explanation.keyPath))}` : ""}.
    ${`Available keys: ${available?.length ? available.map((k) => styles.highlight(k)).join(", ") : "(none)"}.`}
  `

  const footer = result.explanation.getFooterMessage?.()

  if (footer) {
    return `${message}\n\n${footer}`
  }

  return message
}

export function deepResolveContext(description: string, context: ConfigContext, rootContext?: ConfigContext) {
  const res = context.resolve({ nodePath: [], key: [], opts: {}, rootContext })
  if (!res.found) {
    throw new ConfigurationError({
      message: `Could not resolve ${description}: ${getUnavailableReason(res)}`,
    })
  }

  return res.resolved
}
