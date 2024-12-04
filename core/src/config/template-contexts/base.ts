/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { isString } from "lodash-es"
import { ConfigurationError, GardenError } from "../../exceptions.js"
import { resolveTemplateString } from "../../template-string/template-string.js"
import type { CustomObjectSchema } from "../common.js"
import { isPrimitive, joi, joiIdentifier } from "../common.js"
import { KeyedSet } from "../../util/keyed-set.js"
import { naturalList } from "../../util/string.js"
import { styles } from "../../logger/styles.js"
import { Profile } from "../../util/profiling.js"

export type ContextKeySegment = string | number
export type ContextKey = ContextKeySegment[]

export interface ContextResolveOpts {
  // Allow templates to be partially resolved (used to defer runtime template resolution, for example)
  allowPartial?: boolean
  // a list of previously resolved paths, used to detect circular references
  stack?: Set<string>
  // Unescape escaped template strings
  unescape?: boolean
}

export interface ContextResolveParams {
  key: ContextKey
  nodePath: ContextKey
  opts: ContextResolveOpts
}

export interface ContextResolveOutput {
  getUnavailableReason?: () => string
  partial?: boolean
  resolved: any
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
export const CONTEXT_RESOLVE_KEY_AVAILABLE_LATER: unique symbol = Symbol.for("ContextResolveKeyAvailableLater")

// Note: we're using classes here to be able to use decorators to describe each context node and key
@Profile()
export abstract class ConfigContext {
  private readonly _rootContext: ConfigContext
  private readonly _resolvedValues: { [path: string]: any }

  // This is used for special-casing e.g. runtime.* resolution
  protected _alwaysAllowPartial: boolean

  constructor(rootContext?: ConfigContext) {
    this._rootContext = rootContext || this
    this._resolvedValues = {}
    this._alwaysAllowPartial = false
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

  resolve({ key, nodePath, opts }: ContextResolveParams): ContextResolveOutput {
    const path = renderKeyPath(key)
    const fullPath = renderKeyPath(nodePath.concat(key))

    // if the key has previously been resolved, return it directly
    const resolved = this._resolvedValues[path]

    if (resolved) {
      return { resolved }
    }

    // TODO: freeze opts object instead of using shallow copy
    opts.stack = new Set(opts.stack || [])

    if (opts.stack.has(fullPath)) {
      // Circular dependency error is critical, throwing here.
      throw new ContextResolveError({
        message: `Circular reference detected when resolving key ${path} (${new Array(opts.stack || []).join(" -> ")})`,
      })
    }

    // keep track of which resolvers have been called, in order to detect circular references
    let getAvailableKeys: (() => string[]) | undefined = undefined
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let value: any = this
    let partial = false
    let nextKey = key[0]
    let nestedNodePath = nodePath
    let getUnavailableReason: (() => string) | undefined = undefined

    for (let p = 0; p < key.length; p++) {
      nextKey = key[p]

      const getRemainder = () => key.slice(p + 1)
      const getNestedNodePath = () => nodePath.concat(key.slice(0, p + 1))
      const getStackEntry = () => renderKeyPath(getNestedNodePath())
      getAvailableKeys = undefined

      if (typeof nextKey === "string" && nextKey.startsWith("_")) {
        value = undefined
      } else if (isPrimitive(value)) {
        throw new ContextResolveError({
          message: `Attempted to look up key ${JSON.stringify(nextKey)} on a ${typeof value}.`,
        })
      } else if (value instanceof Map) {
        getAvailableKeys = () => value.keys()
        value = value.get(nextKey)
      } else {
        getAvailableKeys = () => Object.keys(value).filter((k) => !k.startsWith("_"))
        value = value[nextKey]
      }

      if (typeof value === "function") {
        // call the function to resolve the value, then continue
        const stackEntry = getStackEntry()
        if (opts.stack?.has(stackEntry)) {
          // Circular dependency error is critical, throwing here.
          throw new ContextResolveError({
            message: `Circular reference detected when resolving key ${stackEntry} (from ${new Array(opts.stack || []).join(" -> ")})`,
          })
        }

        opts.stack.add(stackEntry)
        value = value({ key: getRemainder(), nodePath: nestedNodePath, opts })
      }

      // handle nested contexts
      if (value instanceof ConfigContext) {
        const remainder = getRemainder()
        if (remainder.length > 0) {
          const stackEntry = getStackEntry()
          opts.stack.add(stackEntry)
          const res = value.resolve({ key: remainder, nodePath: nestedNodePath, opts })
          value = res.resolved
          getUnavailableReason = res.getUnavailableReason
          partial = !!res.partial
        }
        break
      }

      // handle templated strings in context variables
      if (isString(value)) {
        opts.stack.add(getStackEntry())
        value = resolveTemplateString({ string: value, context: this._rootContext, contextOpts: opts })
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

      if (typeof resolved === "symbol") {
        return { resolved, getUnavailableReason }
      }

      // If we're allowing partial strings, we throw the error immediately to end the resolution flow. The error
      // is caught in the surrounding template resolution code.
      if (this._alwaysAllowPartial || opts.allowPartial) {
        return {
          resolved: CONTEXT_RESOLVE_KEY_AVAILABLE_LATER,
          getUnavailableReason,
        }
      } else {
        return { resolved: CONTEXT_RESOLVE_KEY_NOT_FOUND, getUnavailableReason }
      }
    }

    // Cache result, unless it is a partial resolution
    if (!partial) {
      this._resolvedValues[path] = value
    }

    return { resolved: value }
  }
}

/**
 * A generic context that just wraps an object.
 */
export class GenericContext extends ConfigContext {
  constructor(obj: any) {
    super()
    Object.assign(this, obj)
  }

  static override getSchema() {
    return joi.object()
  }
}

/**
 * This is a utility context, used to extract all template references from a template.
 */
export class ScanContext extends ConfigContext {
  foundKeys: KeyedSet<ContextKeySegment[]>

  constructor() {
    super()
    this.foundKeys = new KeyedSet<ContextKeySegment[]>((v) => renderKeyPath(v))
  }

  override resolve({ key, nodePath }: ContextResolveParams) {
    const fullKey = nodePath.concat(key)
    this.foundKeys.add(fullKey)
    return { resolved: CONTEXT_RESOLVE_KEY_AVAILABLE_LATER, partial: true }
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
