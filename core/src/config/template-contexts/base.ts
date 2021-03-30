/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import chalk from "chalk"
import { isString } from "lodash"
import { ConfigurationError } from "../../exceptions"
import {
  resolveTemplateString,
  TemplateStringMissingKeyException,
  TemplateStringPassthroughException,
} from "../../template-string/template-string"
import { joi } from "../common"
import { KeyedSet } from "../../util/keyed-set"
import { naturalList } from "../../util/string"
import { isPrimitive } from "util"

export type ContextKeySegment = string | number
export type ContextKey = ContextKeySegment[]

export interface ContextResolveOpts {
  // Allow templates to be partially resolved (used to defer runtime template resolution, for example)
  allowPartial?: boolean
  // a list of previously resolved paths, used to detect circular references
  stack?: string[]
  // Unescape escaped template strings
  unescape?: boolean
}

export interface ContextResolveParams {
  key: ContextKey
  nodePath: ContextKey
  opts: ContextResolveOpts
}

export interface ContextResolveOutput {
  message?: string
  partial?: boolean
  resolved: any
}

export function schema(joiSchema: Joi.Schema) {
  return (target: any, propName: string) => {
    target.constructor._schemas = { ...(target.constructor._schemas || {}), [propName]: joiSchema }
  }
}

// Note: we're using classes here to be able to use decorators to describe each context node and key
export abstract class ConfigContext {
  private readonly _rootContext: ConfigContext
  private readonly _resolvedValues: { [path: string]: string }

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

  resolve({ key, nodePath, opts }: ContextResolveParams): ContextResolveOutput {
    const path = renderKeyPath(key)
    const fullPath = renderKeyPath(nodePath.concat(key))

    // if the key has previously been resolved, return it directly
    const resolved = this._resolvedValues[path]

    if (resolved) {
      return { resolved }
    }

    opts.stack = [...(opts.stack || [])]

    if (opts.stack.includes(fullPath)) {
      throw new ConfigurationError(
        `Circular reference detected when resolving key ${path} (${opts.stack.join(" -> ")})`,
        {
          nodePath,
          fullPath,
          opts,
        }
      )
    }

    // keep track of which resolvers have been called, in order to detect circular references
    let available: any[] | null = null
    let value: any = this
    let partial = false
    let nextKey = key[0]
    let lookupPath: ContextKeySegment[] = []
    let nestedNodePath = nodePath
    let message: string | undefined = undefined

    for (let p = 0; p < key.length; p++) {
      nextKey = key[p]
      lookupPath = key.slice(0, p + 1)
      const remainder = key.slice(p + 1)
      nestedNodePath = nodePath.concat(lookupPath)
      const stackEntry = renderKeyPath(nestedNodePath)
      available = null

      if (typeof nextKey === "string" && nextKey.startsWith("_")) {
        value = undefined
      } else if (isPrimitive(value)) {
        throw new ConfigurationError(`Attempted to look up key ${JSON.stringify(nextKey)} on a ${typeof value}.`, {
          value,
          nodePath,
          fullPath,
          opts,
        })
      } else if (value instanceof Map) {
        available = [...value.keys()]
        value = value.get(nextKey)
      } else {
        available = Object.keys(value).filter((k) => !k.startsWith("_"))
        value = value[nextKey]
      }

      if (typeof value === "function") {
        // call the function to resolve the value, then continue
        if (opts.stack.includes(stackEntry)) {
          throw new ConfigurationError(
            `Circular reference detected when resolving key ${stackEntry} (from ${opts.stack.join(" -> ")})`,
            {
              nodePath,
              fullPath,
              opts,
            }
          )
        }

        opts.stack.push(stackEntry)
        value = value({ key: remainder, nodePath: nestedNodePath, opts })
      }

      // handle nested contexts
      if (value instanceof ConfigContext) {
        if (remainder.length > 0) {
          opts.stack.push(stackEntry)
          const res = value.resolve({ key: remainder, nodePath: nestedNodePath, opts })
          value = res.resolved
          message = res.message
          partial = !!res.partial
        }
        break
      }

      // handle templated strings in context variables
      if (isString(value)) {
        opts.stack.push(stackEntry)
        value = resolveTemplateString(value, this._rootContext, opts)
      }

      if (value === undefined) {
        break
      }
    }

    if (value === undefined) {
      if (message === undefined) {
        message = chalk.red(`Could not find key ${chalk.white(nextKey)}`)
        if (nestedNodePath.length > 1) {
          message += chalk.red(" under ") + chalk.white(renderKeyPath(nestedNodePath.slice(0, -1)))
        }
        message += chalk.red(".")

        if (available && available.length) {
          message += chalk.red(" Available keys: " + naturalList(available.sort().map((k) => chalk.white(k))) + ".")
        }
      }

      // If we're allowing partial strings, we throw the error immediately to end the resolution flow. The error
      // is caught in the surrounding template resolution code.
      if (this._alwaysAllowPartial) {
        // We use a separate exception type when contexts are specifically indicating that unresolvable keys should
        // be passed through. This is caught in the template parser code.
        throw new TemplateStringPassthroughException(message, {
          nodePath,
          fullPath,
          opts,
        })
      } else if (opts.allowPartial) {
        throw new TemplateStringMissingKeyException(message, {
          nodePath,
          fullPath,
          opts,
        })
      } else {
        // Otherwise we return the undefined value, so that any logical expressions can be evaluated appropriately.
        // The template resolver will throw the error later if appropriate.
        return { resolved: undefined, message }
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

  static getSchema() {
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

  resolve({ key, nodePath }: ContextResolveParams) {
    const fullKey = nodePath.concat(key)
    this.foundKeys.add(fullKey)
    return { resolved: renderTemplateString(fullKey), partial: true }
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

  resolve({}): ContextResolveOutput {
    throw new ConfigurationError(this.message, {})
  }
}

/**
 * Given all the segments of a template string, return a new template string that can be resolved later.
 */
function renderTemplateString(key: ContextKeySegment[]) {
  return "${" + renderKeyPath(key) + "}"
}

/**
 * Given all the segments of a template string, return a string path for the key.
 */
function renderKeyPath(key: ContextKeySegment[]): string {
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
