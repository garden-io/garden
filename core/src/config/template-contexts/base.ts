/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { ConfigurationError, GardenError, InternalError } from "../../exceptions.js"
import type { CustomObjectSchema } from "../common.js"
import { joi, joiIdentifier } from "../common.js"
import { naturalList } from "../../util/string.js"
import { styles } from "../../logger/styles.js"
import { Profile } from "../../util/profiling.js"
import type { Collection } from "../../util/objects.js"
import { deepMap, isPlainObject, type CollectionOrValue } from "../../util/objects.js"
import type { ParsedTemplate, ResolvedTemplate, TemplatePrimitive } from "../../template/types.js"
import { isTemplatePrimitive, UnresolvedTemplateValue } from "../../template/types.js"
import pick from "lodash-es/pick.js"
import { deepEvaluate, evaluate } from "../../template/evaluate.js"
import merge from "lodash-es/merge.js"

export type ContextKeySegment = string | number
export type ContextKey = ContextKeySegment[]

export interface ContextResolveOpts {
  // This is kept for backwards compatibility of rendering kubernetes manifests
  // TODO(0.14): Do not allow the use of template strings in kubernetes manifest files
  // TODO(0.14): Remove legacyAllowPartial
  legacyAllowPartial?: boolean

  // a list of values for detecting circular references
  contextStack?: Set<unknown>
  keyStack?: Set<string>

  // TODO: remove
  unescape?: boolean
}

export interface ContextResolveParams {
  key: ContextKey
  nodePath: ContextKey
  opts: ContextResolveOpts
  rootContext?: ConfigContext
}

export type ContextResolveOutput =
  | {
      resolved: ResolvedTemplate
      getUnavailableReason?: undefined
    }
  | {
      resolved: typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
      getUnavailableReason: () => string
    }

export function schema(joiSchema: Joi.Schema) {
  return (target: any, propName: string) => {
    target.constructor._schemas = { ...(target.constructor._schemas || {}), [propName]: joiSchema }
  }
}

export interface ConfigContextType {
  new (...params: any[]): ConfigContext

  getSchema(): CustomObjectSchema
}

/**
 * This error is thrown for a "final" errors, i.e. ones that cannot be ignored.
 * For key not found errors that could be resolvable we still can return a special symbol.
 */
export class ContextResolveError extends GardenError {
  type = "context-resolve"
}

export const CONTEXT_RESOLVE_KEY_NOT_FOUND: unique symbol = Symbol.for("ContextResolveKeyNotFound")

// Note: we're using classes here to be able to use decorators to describe each context node and key
@Profile()
export abstract class ConfigContext {
  private readonly _rootContext?: ConfigContext
  private readonly _resolvedValues: { [path: string]: any }
  private readonly _startingPoint?: string

  constructor(rootContext?: ConfigContext, startingPoint?: string) {
    if (rootContext) {
      this._rootContext = rootContext
    }
    if (startingPoint) {
      this._startingPoint = startingPoint
    }
    this._resolvedValues = {}
  }

  static getSchema() {
    const schemas = (<any>this)._schemas
    return joi.object().keys(schemas).required()
  }

  /**
   * Override this method to add more context to error messages thrown in the `resolve` method when a missing key is
   * referenced.
   */
  getMissingKeyErrorFooter(_key: ContextKeySegment, _path: ContextKeySegment[]): string {
    return ""
  }

  resolve({ key, nodePath, opts, rootContext }: ContextResolveParams): ContextResolveOutput {
    const getRootContext = () => {
      if (rootContext && this._rootContext) {
        return new LayeredContext(rootContext, this._rootContext)
      }
      return rootContext || this._rootContext || this
    }

    const path = key.join(".")

    // if the key has previously been resolved, return it directly
    const alreadyResolved = this._resolvedValues[path]

    if (alreadyResolved) {
      return { resolved: alreadyResolved }
    }

    // keep track of which resolvers have been called, in order to detect circular references
    let getAvailableKeys: (() => string[]) | undefined = undefined

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let value: CollectionOrValue<ParsedTemplate | TemplatePrimitive | ConfigContext> = this._startingPoint
      ? this[this._startingPoint]
      : this

    if (!isPlainObject(value) && !(value instanceof ConfigContext) && !(value instanceof UnresolvedTemplateValue)) {
      throw new InternalError({
        message: `Invalid config context root: ${typeof value}`,
      })
    }

    // TODO: freeze opts object instead of using shallow copy
    opts.keyStack = new Set(opts.keyStack || [])
    opts.contextStack = new Set(opts.contextStack || [])

    if (opts.contextStack.has(value)) {
      // TODO: fix circular ref detection
      // Circular dependency error is critical, throwing here.
      // throw new ContextResolveError({
      //   message: `Circular reference detected when resolving key ${path} (${Array.from(opts.keyStack || []).join(" -> ")})`,
      // })
    }

    let nextKey = key[0]
    let nestedNodePath = nodePath
    let getUnavailableReason: (() => string) | undefined = undefined

    if (key.length === 0 && !(value instanceof UnresolvedTemplateValue)) {
      value = pick(
        value,
        Object.keys(value as Collection<unknown>).filter((k) => !k.startsWith("_"))
      ) as Record<string, CollectionOrValue<TemplatePrimitive | ConfigContext>>
    }

    for (let p = 0; p < key.length; p++) {
      nextKey = key[p]

      nestedNodePath = nodePath.concat(key.slice(0, p + 1))
      const getRemainder = () => key.slice(p + 1)

      const capturedNestedNodePath = nestedNodePath
      const getStackEntry = () => renderKeyPath(capturedNestedNodePath)
      getAvailableKeys = undefined

      // handle nested contexts
      if (value instanceof ConfigContext) {
        const remainder = getRemainder()
        const stackEntry = getStackEntry()
        opts.keyStack.add(stackEntry)
        opts.contextStack.add(value)
        // NOTE: we resolve even if remainder.length is zero to make sure all unresolved template values have been resolved.
        const res = value.resolve({ key: remainder, nodePath: nestedNodePath, opts, rootContext })
        if (res.resolved === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
          throw new InternalError({
            message: "unhandled resolve key not found",
          })
        }
        value = res.resolved
        getUnavailableReason = res.getUnavailableReason
        break
      }

      // handle templated strings in context variables
      if (value instanceof UnresolvedTemplateValue) {
        opts.keyStack.add(getStackEntry())
        opts.contextStack.add(value)
        const { resolved } = evaluate(value, { context: getRootContext(), opts })
        value = resolved
      }

      const parent: CollectionOrValue<ParsedTemplate | TemplatePrimitive | ConfigContext> = value
      if (isTemplatePrimitive(parent)) {
        throw new ContextResolveError({
          message: `Attempted to look up key ${JSON.stringify(nextKey)} on a ${typeof parent}.`,
        })
      } else if (typeof nextKey === "string" && nextKey.startsWith("_")) {
        value = undefined
      } else if (parent instanceof Map) {
        getAvailableKeys = () => Array.from(parent.keys())
        value = parent.get(nextKey)
      } else {
        getAvailableKeys = () => {
          return Object.keys(parent).filter((k) => !k.startsWith("_"))
        }
        value = parent[nextKey]
      }

      if (value === undefined) {
        break
      }
    }

    if (value === undefined || typeof value === "symbol") {
      if (getUnavailableReason === undefined) {
        getUnavailableReason = () => {
          let message = styles.error(`Could not find key ${styles.highlight(String(nextKey))}`)
          if (nestedNodePath.length > 1) {
            message += styles.error(" under ") + styles.highlight(renderKeyPath(nestedNodePath.slice(0, -1)))
          }
          message += styles.error(".")

          if (getAvailableKeys) {
            const availableKeys = getAvailableKeys()
            const availableStr = availableKeys.length
              ? naturalList(availableKeys.sort().map((k) => styles.highlight(k)))
              : "(none)"
            message += styles.error(" Available keys: " + availableStr + ".")
          }
          const messageFooter = this.getMissingKeyErrorFooter(nextKey, nestedNodePath.slice(0, -1))
          if (messageFooter) {
            message += `\n\n${messageFooter}`
          }
          return message
        }
      }

      if (typeof value === "symbol") {
        return { resolved: value, getUnavailableReason }
      }

      return { resolved: CONTEXT_RESOLVE_KEY_NOT_FOUND, getUnavailableReason }
    }

    if (!isTemplatePrimitive(value)) {
      value = deepMap(value, (v, keyPath) => {
        if (v instanceof ConfigContext) {
          const { resolved } = v.resolve({ key: [], nodePath: nodePath.concat(key, keyPath), opts })
          if (resolved === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
            throw new InternalError({
              message: "Unhandled context resolve key not found",
            })
          }
          return resolved
        }
        return deepEvaluate(v, { context: getRootContext(), opts })
      })
    }

    // Cache result
    this._resolvedValues[path] = value

    return { resolved: value as ResolvedTemplate }
  }
}

/**
 * A generic context that just wraps an object.
 */
export class GenericContext extends ConfigContext {
  constructor(private readonly data: any) {
    if (data === undefined) {
      throw new InternalError({
        message: "Generic context may not be undefined.",
      })
    }
    if (data instanceof ConfigContext) {
      throw new InternalError({
        message:
          "Generic context is useless when instantiated with just another context as parameter. Use the other context directly instead.",
      })
    }
    super(undefined, "data")
  }

  static override getSchema() {
    return joi.object()
  }
}

export class EnvironmentContext extends ConfigContext {
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

  constructor(root: ConfigContext, name: string, fullName: string, namespace?: string) {
    super(root)
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

  override resolve({}): ContextResolveOutput {
    throw new ConfigurationError({ message: this.message })
  }
}

export class ParentContext extends ConfigContext {
  @schema(joiIdentifier().description(`The name of the parent config.`))
  public name: string

  constructor(root: ConfigContext, name: string) {
    super(root)
    this.name = name
  }
}

export class TemplateContext extends ConfigContext {
  @schema(joiIdentifier().description(`The name of the template.`))
  public name: string

  constructor(root: ConfigContext, name: string) {
    super(root)
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
    super(rootContext)
  }

  override resolve(params: ContextResolveParams): ContextResolveOutput {
    return this.wrapped.resolve({
      ...params,
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
  override resolve(args: ContextResolveParams): ContextResolveOutput {
    const items: ResolvedTemplate[] = []

    for (const [i, context] of this.contexts.entries()) {
      const resolved = context.resolve(args)
      if (resolved.resolved !== CONTEXT_RESOLVE_KEY_NOT_FOUND) {
        if (isTemplatePrimitive(resolved.resolved)) {
          return resolved
        }
        items.push(resolved.resolved)
      } else if (items.length === 0 && i === this.contexts.length - 1) {
        return resolved
      }
    }

    const returnValue = {}

    for (const i of items) {
      merge(returnValue, { resolved: i })
    }

    return {
      resolved: returnValue["resolved"],
    }
  }
}
