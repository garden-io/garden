/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { ConfigurationError } from "../../exceptions.js"
import type { CustomObjectSchema } from "../common.js"
import { isPrimitive, joi, joiIdentifier } from "../common.js"
import { KeyedSet } from "../../util/keyed-set.js"
import { naturalList } from "../../util/string.js"
import { styles } from "../../logger/styles.js"
import type { TemplateValue } from "../../template-string/inputs.js"
import { TemplateLeaf, isTemplateLeafValue, isTemplateLeaf } from "../../template-string/inputs.js"
import type { CollectionOrValue } from "../../util/objects.js"
import { deepMap } from "../../util/objects.js"
import { LazyValue } from "../../template-string/lazy.js"
import { GardenConfig } from "../../template-string/validation.js"

export type ContextKeySegment = string | number
export type ContextKey = ContextKeySegment[]

export type ObjectPath = (string | number)[]

export interface ContextResolveOpts {
  // Allow templates to be partially resolved (used to defer runtime template resolution, for example)
  // TODO: Remove this from context resolve opts: The context does not care if we resolve template strings partially.
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
  result: CollectionOrValue<TemplateValue> | typeof CONTEXT_RESOLVE_KEY_NOT_FOUND
  cached: boolean
  // for input tracking
  // ResolvedResult: ResolvedResult
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

export const CONTEXT_RESOLVE_KEY_NOT_FOUND = Symbol.for("ContextResolveKeyNotFound")

// Note: we're using classes here to be able to use decorators to describe each context node and key
// TODO-steffen&thor: Make all instance variables of all config context classes read-only.
export abstract class ConfigContext {
  private readonly _rootContext: ConfigContext
  private readonly _resolvedValues: { [path: string]: CollectionOrValue<TemplateValue> }

  constructor(rootContext?: ConfigContext) {
    this._rootContext = rootContext || this
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

  resolve({ key, nodePath, opts }: ContextResolveParams): ContextResolveOutput {
    const path = renderKeyPath(key)
    const fullPath = renderKeyPath(nodePath.concat(key))

    // if the key has previously been resolved, return it directly
    const cachedResult = this._resolvedValues[path]

    if (cachedResult) {
      return { cached: true, result: cachedResult }
    }

    opts.stack = [...(opts.stack || [])]

    if (opts.stack.includes(fullPath)) {
      throw new ConfigurationError({
        message: `Circular reference detected when resolving key ${path} (${opts.stack.join(" -> ")})`,
      })
    }

    // keep track of which resolvers have been called, in order to detect circular references
    let available: any[] | null = null
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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
        throw new ConfigurationError({
          message: `Attempted to look up key ${JSON.stringify(nextKey)} on a ${typeof value}.`,
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
          throw new ConfigurationError({
            message: `Circular reference detected when resolving key ${stackEntry} (from ${opts.stack.join(" -> ")})`,
          })
        }

        opts.stack.push(stackEntry)
        value = value({ key: remainder, nodePath: nestedNodePath, opts })
      }

      // handle nested contexts
      if (value instanceof ConfigContext) {
        if (remainder.length > 0) {
          opts.stack.push(stackEntry)
          const res = value.resolve({ key: remainder, nodePath: nestedNodePath, opts })
          value = res.result
          message = res.message
          partial = !!res.partial
        } else {
          // TODO: improve error message
          throw new ConfigurationError({
            message: `Resolving to a context is not allowed.`,
          })
        }
        break
      }

      if (isTemplateLeaf(value) || value instanceof LazyValue) {
        break
      }

      if (value === undefined) {
        break
      }
    }

    if (value === undefined) {
      if (message === undefined) {
        message = styles.error(`Could not find key ${styles.accent(String(nextKey))}`)
        if (nestedNodePath.length > 1) {
          message += styles.error(" under ") + styles.accent(renderKeyPath(nestedNodePath.slice(0, -1)))
        }
        message += styles.error(".")

        if (available) {
          const availableStr = available.length ? naturalList(available.sort().map((k) => styles.accent(k))) : "(none)"
          message += styles.error(" Available keys: " + availableStr + ".")
        }
        const messageFooter = this.getMissingKeyErrorFooter(nextKey, nestedNodePath.slice(0, -1))
        if (messageFooter) {
          message += `\n\n${messageFooter}`
        }
      }

      return {
        message,
        cached: false,
        result: CONTEXT_RESOLVE_KEY_NOT_FOUND,
      }
    }

    let result: CollectionOrValue<TemplateValue>

    if (value instanceof LazyValue) {
      result = value
    } else if (isTemplateLeaf(value)) {
      result = value
    }
    // Wrap normal data using deepMap
    else if (isTemplateLeafValue(value)) {
      result = new TemplateLeaf({
        expr: undefined,
        value,
        inputs: {},
      })
    } else {
      // value is a collection
      result = deepMap(value, (v) => {
        if (isTemplateLeaf(v) || v instanceof LazyValue) {
          return v
        }
        return new TemplateLeaf({
          expr: undefined,
          value: v,
          inputs: {},
        })
      })
    }

    // Cache result, unless it is a partial resolution
    if (!partial) {
      this._resolvedValues[path] = result
    }

    return { cached: false, result }
  }
}

/**
 * LayeredContext takes a list of contexts, and tries to resolve a key in each of them, in order.
 *
 * It returns the first value that successfully resolved.
 */
export class LayeredContext extends ConfigContext {
  private readonly _layers: ConfigContext[]

  constructor(...layers: ConfigContext[]) {
    super()
    this._layers = layers
  }

  override resolve({ key, nodePath, opts }: ContextResolveParams): ContextResolveOutput {
    let res: ContextResolveOutput = { cached: false, result: CONTEXT_RESOLVE_KEY_NOT_FOUND }

    for (const [index, layer] of this._layers.entries()) {
      const isLastLayer = index === this._layers.length - 1

      res = layer.resolve({
        key,
        nodePath,
        opts: {
          ...opts,
          // Throw an error if we can't find the value in the last layer, unless allowPartial is set
          allowPartial: isLastLayer ? opts.allowPartial : false,
        },
      })

      // break if we successfully resolved something
      if (res.result !== CONTEXT_RESOLVE_KEY_NOT_FOUND) {
        break
      }
    }

    return res
  }
}

/**
 * A generic context that just wraps an object.
 */
export class GenericContext extends ConfigContext {
  constructor(obj: any) {
    super()

    // If we pass in template variables, we want to store the underlying template value tree
    // Otherwise we lose input tracking information
    const templateValueTree = GardenConfig.getTemplateValueTree(obj)

    if (templateValueTree) {
      Object.assign(this, templateValueTree)
    } else {
      Object.assign(this, obj)
    }
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
    return {
      partial: true,
      cached: false,
      result: new TemplateLeaf({ value: renderTemplateString(fullKey), expr: undefined, inputs: {} }),
    }
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
 * Given all the segments of a template string, return a new template string that can be resolved later.
 */
function renderTemplateString(key: ContextKeySegment[]) {
  return "${" + renderKeyPath(key) + "}"
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
