/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { ConfigurationError, InternalError } from "../../exceptions.js"
import type { CustomObjectSchema } from "../common.js"
import { joi, joiIdentifier } from "../common.js"
import { Profile } from "../../util/profiling.js"
import { deepMap, type Collection, type CollectionOrValue } from "../../util/objects.js"
import type { ParsedTemplate, ParsedTemplateValue, ResolvedTemplate, TemplatePrimitive } from "../../template/types.js"
import { isTemplatePrimitive, UnresolvedTemplateValue } from "../../template/types.js"
import merge from "lodash-es/merge.js"
import omitBy from "lodash-es/omitBy.js"
import { flatten, isEqual, uniq } from "lodash-es"
import { isMap } from "util/types"
import { deline } from "../../util/string.js"

export type ContextKeySegment = string | number
export type ContextKey = ContextKeySegment[]

export interface ContextResolveOpts {
  // This is kept for backwards compatibility of rendering kubernetes manifests
  // TODO(0.14): Do not allow the use of template strings in kubernetes manifest files
  // TODO(0.14): Remove legacyAllowPartial
  legacyAllowPartial?: boolean

  // for detecting circular references
  stack?: string[]

  // TODO: remove
  unescape?: boolean
}

export interface ContextResolveParams {
  /**
   * Key path to look up in the context.
   */
  key: ContextKey

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
    reason: "key_not_found" | "not_indexable"
    key: string | number
    keyPath: (string | number)[]
    availableKeys?: (string | number)[]
  }
}

export type ContextResolveOutput =
  | {
      found: true
      resolved: ResolvedTemplate
      partial?: Collection<ConfigContext | ParsedTemplate> | TemplatePrimitive
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

export abstract class ConfigContext {
  private readonly _cache: Map<string, ContextResolveOutput>
  private readonly _id: number

  constructor() {
    this._id = globalConfigContextCounter++
    this._cache = new Map()
  }

  private detectCircularReference({ key, opts }: ContextResolveParams) {
    const keyStr = `${this.constructor.name}(${this._id})-${renderKeyPath(key)}`
    if (opts.stack?.includes(keyStr)) {
      throw new ConfigurationError({
        message: `Circular reference detected: ${opts.stack.map((s) => s.split("-")[1]).join(" -> ")}`,
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
      }
      return res
    } finally {
      params.opts.stack.pop()
    }
  }

  /**
   * Override this method to add more context to error messages thrown in the `resolve` method when a missing key is
   * referenced.
   */
  protected getMissingKeyErrorFooter(_key: ContextKeySegment, _path: ContextKeySegment[]): string {
    return ""
  }
}

// Note: we're using classes here to be able to use decorators to describe each context node and key
@Profile()
export abstract class ContextWithSchema extends ConfigContext {
  static getSchema() {
    const schemas = (<any>this)._schemas
    return joi.object().keys(schemas).required()
  }

  private get startingPoint() {
    // Make sure we filter keys that start with underscore
    return
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
  constructor(protected readonly data: ParsedTemplate | Collection<ParsedTemplate | ConfigContext>) {
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
    super()
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
  public name: string

  @schema(
    joi
      .string()
      .required()
      .description("The full name of the environment Garden is running against, including the namespace.")
      .example("my-namespace.local")
  )
  public fullName: string

  @schema(joi.string().description("The currently active namespace (if any).").example("my-namespace"))
  public namespace: string

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
  constructor(private message: string) {
    super()
  }

  protected override resolveImpl({}): ContextResolveOutput {
    throw new ConfigurationError({ message: this.message })
  }
}

export class ParentContext extends ContextWithSchema {
  @schema(joiIdentifier().description(`The name of the parent config.`))
  public name: string

  constructor(name: string) {
    super()
    this.name = name
  }
}

export class TemplateContext extends ContextWithSchema {
  @schema(joiIdentifier().description(`The name of the template.`))
  public name: string

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
export class CapturedContext extends ConfigContext {
  constructor(
    private readonly wrapped: ConfigContext,
    private readonly rootContext: ConfigContext
  ) {
    super()
  }

  override resolveImpl(params: ContextResolveParams): ContextResolveOutput {
    return this.wrapped.resolve({
      ...params,
      opts: {
        ...params.opts,
        // to avoid circular dep errors
        stack: params.opts.stack?.slice(0, -1),
      },
      rootContext: params.rootContext ? new LayeredContext(this.rootContext, params.rootContext) : this.rootContext,
    })
  }
}

export class LayeredContext extends ConfigContext {
  private readonly contexts: ConfigContext[]
  constructor(...contexts: ConfigContext[]) {
    super()
    this.contexts = contexts
  }
  override resolveImpl(args: ContextResolveParams): ContextResolveOutput {
    const items: ContextResolveOutput[] = []

    for (const context of this.contexts) {
      const resolved = context.resolve({
        ...args,
        opts: {
          ...args.opts,
          // to avoid circular dependency errors
          stack: args.opts.stack?.slice(0, -1),
        },
      })
      if (resolved.found) {
        if (isTemplatePrimitive(resolved.resolved)) {
          return resolved
        }
      }

      items.push(resolved)
    }

    // if it could not be found in any context, aggregate error information from all contexts
    if (items.every((res) => !res.found)) {
      // find deepest key path (most specific error)
      let deepestKeyPath: (number | string)[] = []
      for (const res of items) {
        if (res.explanation.keyPath.length > deepestKeyPath.length) {
          deepestKeyPath = res.explanation.keyPath
        }
      }

      // identify all errors with the same key path
      const all = items.filter((res) => isEqual(res.explanation.keyPath, deepestKeyPath))
      const lastError = all[all.length - 1]

      return {
        ...lastError,
        explanation: {
          ...lastError.explanation,
          availableKeys: uniq(flatten(all.map((res) => res.explanation.availableKeys || []))),
        },
      }
    }

    const returnValue = {}

    for (const i of items) {
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

function traverseContext(
  value: CollectionOrValue<ConfigContext | ParsedTemplateValue>,
  params: ContextResolveParams & { rootContext: ConfigContext }
): ContextResolveOutput {
  const rootContext = params.rootContext
  if (value instanceof UnresolvedTemplateValue) {
    const evaluated = value.evaluate({ context: rootContext, opts: params.opts })
    return traverseContext(evaluated.resolved, params)
  }

  if (value instanceof ConfigContext) {
    const evaluated = value.resolve(params)
    return evaluated
  }

  const keyPath = params.key
  if (keyPath.length > 0) {
    const nextKey = params.key[0]

    if (isTemplatePrimitive(value)) {
      return {
        found: false,
        explanation: {
          reason: "not_indexable",
          key: nextKey,
          keyPath: [],
        },
      }
    }

    const remainder = params.key.slice(1)

    let nextValue: CollectionOrValue<ConfigContext | ParsedTemplateValue>
    if (isMap(value)) {
      nextValue = value.get(nextKey) as CollectionOrValue<ConfigContext | ParsedTemplateValue>
    } else {
      nextValue = value[nextKey]
    }

    if (nextValue === undefined) {
      return {
        found: false,
        explanation: {
          reason: "key_not_found",
          key: nextKey,
          keyPath: [],
          availableKeys: isMap(value) ? (value.keys() as any).toArray() : Object.keys(value),
        },
      }
    }

    const result = traverseContext(nextValue, {
      ...params,
      key: remainder,
    })

    if (result.found) {
      return result
    }

    return prependKeyPath(result, [nextKey])
  }

  // handles the case when keyPath.length === 0 (here, we need to eagerly resolve everything)
  const notFoundValues: ContextResolveOutputNotFound[] = []
  const resolved = deepMap(value, (v, _, deepMapKeyPath) => {
    const innerParams = {
      ...params,
      // we ask nested values to be fully resolved recursively
      key: [],
    }
    if (v instanceof UnresolvedTemplateValue || v instanceof ConfigContext) {
      const res = traverseContext(v, innerParams)

      if (res.found) {
        return res.resolved
      }

      notFoundValues.push(prependKeyPath(res, params.key.concat(deepMapKeyPath)))

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

function prependKeyPath(
  res: ContextResolveOutputNotFound,
  keyPathToPrepend: (string | number)[]
): ContextResolveOutputNotFound {
  return {
    ...res,
    explanation: {
      ...res.explanation,
      keyPath: [...keyPathToPrepend, ...res.explanation.keyPath],
    },
  }
}

export function getUnavailableReason(result: ContextResolveOutput): string {
  if (result.found) {
    throw new InternalError({
      message: "called getUnavailableReason on key where found=true",
    })
  }

  if (result.explanation.reason === "not_indexable") {
    return `Cannot lookup key ${result.explanation.key} on primitive value ${renderKeyPath(result.explanation.keyPath)}.`
  }

  const available = result.explanation.availableKeys

  return deline`
    Could not find key ${result.explanation.key}${result.explanation.keyPath.length > 0 ? ` under ${renderKeyPath(result.explanation.keyPath)}` : ""}.
    ${available?.length ? `Available keys: ${available.join(", ")}.` : ""}
  `
}
