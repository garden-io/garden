/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenErrorParams } from "../exceptions.js"
import { ConfigurationError, GardenError, TemplateStringError } from "../exceptions.js"
import type {
  ConfigContext,
  ContextKeySegment,
  ContextResolveOpts,
  ContextResolveOutput,
} from "../config/template-contexts/base.js"
import { GenericContext, ScanContext } from "../config/template-contexts/base.js"
import cloneDeep from "fast-copy"
import { difference, isNumber, isPlainObject, isString, uniq } from "lodash-es"
import type { ActionReference, Primitive, StringMap } from "../config/common.js"
import {
  arrayConcatKey,
  arrayForEachFilterKey,
  arrayForEachKey,
  arrayForEachReturnKey,
  conditionalElseKey,
  conditionalKey,
  conditionalThenKey,
  isPrimitive,
  isSpecialKey,
  objectSpreadKey,
} from "../config/common.js"
import { dedent, deline, naturalList, titleize, truncate } from "../util/string.js"
import type { ObjectWithName } from "../util/util.js"
import type { Log } from "../logger/log-entry.js"
import type { ModuleConfigContext } from "../config/template-contexts/module.js"
import { callHelperFunction } from "./functions.js"
import type { ActionKind } from "../actions/types.js"
import { actionKindsLower } from "../actions/types.js"
import { deepMap } from "../util/objects.js"
import type { ConfigSource } from "../config/validation.js"
import * as parser from "./parser.js"
import { styles } from "../logger/styles.js"
import type { ObjectPath } from "../config/base.js"
import { profile } from "../util/profiling.js"

const missingKeyExceptionType = "template-string-missing-key"
const passthroughExceptionType = "template-string-passthrough"
const escapePrefix = "$${"

export class TemplateStringMissingKeyException extends GardenError {
  type = missingKeyExceptionType
}

export class TemplateStringPassthroughException extends GardenError {
  type = passthroughExceptionType
}

interface ResolvedClause extends ContextResolveOutput {
  block?: "if" | "else" | "else if" | "endif"
  _error?: Error
}

interface ConditionalTree {
  type: "root" | "if" | "else" | "value"
  value?: any
  children: ConditionalTree[]
  parent?: ConditionalTree
}

function getValue(v: Primitive | undefined | ResolvedClause) {
  return isPlainObject(v) ? (v as ResolvedClause).resolved : v
}

function isPartiallyResolved(v: Primitive | undefined | ResolvedClause): boolean {
  if (!isPlainObject(v)) {
    return false
  }

  const clause = v as ResolvedClause
  return !!clause.partial
}

export class TemplateError extends GardenError {
  type = "template"

  path: ObjectPath | undefined
  value: any
  resolved: any

  constructor(params: GardenErrorParams & { path: ObjectPath | undefined; value: any; resolved: any }) {
    super(params)
    this.path = params.path
    this.value = params.value
    this.resolved = params.resolved
  }
}

/**
 * Parse and resolve a templated string, with the given context. The template format is similar to native JS templated
 * strings but only supports simple lookups from the given context, e.g. "prefix-${nested.key}-suffix", and not
 * arbitrary JS code.
 *
 * The context should be a ConfigContext instance. The optional `stack` parameter is used to detect circular
 * dependencies when resolving context variables.
 */
export const resolveTemplateString = profile(function resolveTemplateString({
  string,
  context,
  contextOpts = {},
  path,
}: {
  string: string
  context: ConfigContext
  contextOpts?: ContextResolveOpts
  path?: ObjectPath
}): any {
  // Just return immediately if this is definitely not a template string
  if (!maybeTemplateString(string)) {
    return string
  }

  try {
    const parsed = parser.parse(string, {
      getKey: (key: string[], resolveOpts?: ContextResolveOpts) => {
        return context.resolve({ key, nodePath: [], opts: { ...contextOpts, ...(resolveOpts || {}) } })
      },
      getValue,
      resolveNested: (nested: string) => resolveTemplateString({ string: nested, context, contextOpts }),
      buildBinaryExpression,
      buildLogicalExpression,
      isArray: Array.isArray,
      ConfigurationError,
      TemplateStringError,
      missingKeyExceptionType,
      passthroughExceptionType,
      allowPartial: !!contextOpts.allowPartial,
      unescape: !!contextOpts.unescape,
      escapePrefix,
      optionalSuffix: "}?",
      isPlainObject,
      isPrimitive,
      callHelperFunction,
    })

    const outputs: ResolvedClause[] = parsed.map((p: any) => {
      return isPlainObject(p) ? p : { resolved: getValue(p) }
    })

    // We need to manually propagate errors in the parser, so we catch them here
    for (const r of outputs) {
      if (r && r["_error"]) {
        throw r["_error"]
      }
    }

    // Use value directly if there is only one (or no) value in the output.
    let resolved: any = outputs[0]?.resolved

    if (outputs.length > 1) {
      // Assemble the parts into a conditional tree
      const tree: ConditionalTree = {
        type: "root",
        children: [],
      }
      let currentNode = tree

      for (const part of outputs) {
        if (part.block === "if") {
          const node: ConditionalTree = {
            type: "if",
            value: !!part.resolved,
            children: [],
            parent: currentNode,
          }
          currentNode.children.push(node)
          currentNode = node
        } else if (part.block === "else") {
          if (currentNode.type !== "if") {
            throw new TemplateStringError({
              message: "Found ${else} block without a preceding ${if...} block.",
            })
          }
          const node: ConditionalTree = {
            type: "else",
            value: !currentNode.value,
            children: [],
            parent: currentNode.parent,
          }
          currentNode.parent!.children.push(node)
          currentNode = node
        } else if (part.block === "endif") {
          if (currentNode.type === "if" || currentNode.type === "else") {
            currentNode = currentNode.parent!
          } else {
            throw new TemplateStringError({
              message: "Found ${endif} block without a preceding ${if...} block.",
            })
          }
        } else {
          const v = getValue(part)

          currentNode.children.push({
            type: "value",
            value: v === null ? "null" : v,
            children: [],
          })
        }
      }

      if (currentNode.type === "if" || currentNode.type === "else") {
        throw new TemplateStringError({ message: "Missing ${endif} after ${if ...} block." })
      }

      // Walk down tree and resolve the output string
      resolved = ""

      function resolveTree(node: ConditionalTree) {
        if (node.type === "value" && node.value !== undefined) {
          resolved += node.value
        } else if (node.type === "root" || ((node.type === "if" || node.type === "else") && !!node.value)) {
          for (const child of node.children) {
            resolveTree(child)
          }
        }
      }

      resolveTree(tree)
    }

    return resolved
  } catch (err) {
    if (!(err instanceof GardenError)) {
      throw err
    }
    const pathDescription = path ? ` at path ${styles.accent(path.join("."))}` : ""
    const prefix = `Invalid template string (${styles.accent(
      truncate(string, 200).replace(/\n/g, "\\n")
    )})${pathDescription}: `
    const message = err.message.startsWith(prefix) ? err.message : prefix + err.message

    throw new TemplateStringError({ message, path })
  }
})

/**
 * Recursively parses and resolves all templated strings in the given object.
 */

// `extends any` here isn't pretty but this function is hard to type correctly
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export const resolveTemplateStrings = profile(function resolveTemplateStrings<T extends any>({
  value,
  context,
  contextOpts = {},
  path,
  source,
}: {
  value: T
  context: ConfigContext
  contextOpts?: ContextResolveOpts
  path?: ObjectPath
  source: ConfigSource | undefined
}): T {
  if (value === null) {
    return null as T
  }
  if (value === undefined) {
    return undefined as T
  }

  if (!path) {
    path = []
  }

  if (typeof value === "string") {
    return <T>resolveTemplateString({ string: value, context, path, contextOpts })
  } else if (Array.isArray(value)) {
    const output: unknown[] = []

    value.forEach((v, i) => {
      if (isPlainObject(v) && v[arrayConcatKey] !== undefined) {
        if (Object.keys(v).length > 1) {
          const extraKeys = naturalList(
            Object.keys(v)
              .filter((k) => k !== arrayConcatKey)
              .map((k) => JSON.stringify(k))
          )
          throw new TemplateError({
            message: `A list item with a ${arrayConcatKey} key cannot have any other keys (found ${extraKeys})`,
            path,
            value,
            resolved: undefined,
          })
        }

        // Handle array concatenation via $concat
        const resolved = resolveTemplateStrings({
          value: v[arrayConcatKey],
          context,
          contextOpts: {
            ...contextOpts,
          },
          path: path && [...path, arrayConcatKey],
          source,
        })

        if (Array.isArray(resolved)) {
          output.push(...resolved)
        } else if (contextOpts.allowPartial) {
          output.push({ $concat: resolved })
        } else {
          throw new TemplateError({
            message: `Value of ${arrayConcatKey} key must be (or resolve to) an array (got ${typeof resolved})`,
            path,
            value,
            resolved,
          })
        }
      } else {
        output.push(resolveTemplateStrings({ value: v, context, contextOpts, source, path: path && [...path, i] }))
      }
    })

    return <T>(<unknown>output)
  } else if (isPlainObject(value)) {
    if (value[arrayForEachKey] !== undefined) {
      // Handle $forEach loop
      return handleForEachObject({ value, context, contextOpts, path, source })
    } else if (value[conditionalKey] !== undefined) {
      // Handle $if conditional
      return handleConditional({ value, context, contextOpts, path, source })
    } else {
      // Resolve $merge keys, depth-first, leaves-first
      let output = {}

      for (const [k, v] of Object.entries(value)) {
        const resolved = resolveTemplateStrings({ value: v, context, contextOpts, source, path: path && [...path, k] })

        if (k === objectSpreadKey) {
          if (isPlainObject(resolved)) {
            output = { ...output, ...resolved }
          } else if (contextOpts.allowPartial) {
            output[k] = resolved
          } else {
            throw new TemplateError({
              message: `Value of ${objectSpreadKey} key must be (or resolve to) a mapping object (got ${typeof resolved})`,
              path: [...path, k],
              value,
              resolved,
            })
          }
        } else {
          output[k] = resolved
        }
      }

      return <T>output
    }
  } else {
    return <T>value
  }
})

const expectedForEachKeys = [arrayForEachKey, arrayForEachReturnKey, arrayForEachFilterKey]

function handleForEachObject({
  value,
  context,
  contextOpts,
  path,
  source,
}: {
  value: any
  context: ConfigContext
  contextOpts: ContextResolveOpts
  path: ObjectPath | undefined
  source: ConfigSource | undefined
}) {
  // Validate input object
  if (value[arrayForEachReturnKey] === undefined) {
    throw new TemplateError({
      message: `Missing ${arrayForEachReturnKey} field next to ${arrayForEachKey} field. Got ${naturalList(
        Object.keys(value)
      )}`,
      path: path && [...path, arrayForEachKey],
      value,
      resolved: undefined,
    })
  }

  const unexpectedKeys = Object.keys(value).filter((k) => !expectedForEachKeys.includes(k))

  if (unexpectedKeys.length > 0) {
    const extraKeys = naturalList(unexpectedKeys.map((k) => JSON.stringify(k)))

    throw new TemplateError({
      message: `Found one or more unexpected keys on ${arrayForEachKey} object: ${extraKeys}. Expected keys: ${naturalList(
        expectedForEachKeys
      )}`,
      path,
      value,
      resolved: undefined,
    })
  }

  // Try resolving the value of the $forEach key
  let resolvedInput = resolveTemplateStrings({
    value: value[arrayForEachKey],
    context,
    contextOpts,
    source,
    path: path && [...path, arrayForEachKey],
  })
  const isObject = isPlainObject(resolvedInput)

  if (!Array.isArray(resolvedInput) && !isObject) {
    if (contextOpts.allowPartial) {
      return value
    } else {
      throw new TemplateError({
        message: `Value of ${arrayForEachKey} key must be (or resolve to) an array or mapping object (got ${typeof resolvedInput})`,
        path: path && [...path, arrayForEachKey],
        value,
        resolved: resolvedInput,
      })
    }
  }

  if (isObject) {
    const keys = Object.keys(resolvedInput)
    const inputContainsSpecialKeys = keys.some((key) => isSpecialKey(key))

    if (inputContainsSpecialKeys) {
      // If partial application is enabled
      // we cannot be sure if the object can be evaluated correctly.
      // There could be an expression in there that goes `{foo || bar}`
      // and `foo` is only to be filled in at a later time, so resolving now would force it to be `bar`.
      // Thus we return the entire object
      //
      // If partial application is disabled
      // then we need to make sure that the resulting expression is evaluated again
      // since the magic keys only get resolved via `resolveTemplateStrings`
      if (contextOpts.allowPartial) {
        return value
      }

      resolvedInput = resolveTemplateStrings({ value: resolvedInput, context, contextOpts, source: undefined })
    }
  }

  const filterExpression = value[arrayForEachFilterKey]

  // TODO: maybe there's a more efficient way to do the cloning/extending?
  const loopContext = cloneDeep(context)

  const output: unknown[] = []

  for (const i of Object.keys(resolvedInput)) {
    const itemValue = resolvedInput[i]

    loopContext["item"] = new GenericContext({ key: i, value: itemValue })

    // Have to override the cache in the parent context here
    // TODO: make this a little less hacky :P
    const resolvedValues = loopContext["_resolvedValues"]
    delete resolvedValues["item.key"]
    delete resolvedValues["item.value"]
    const subValues = Object.keys(resolvedValues).filter((k) => k.match(/item\.value\.*/))
    subValues.forEach((v) => delete resolvedValues[v])

    // Check $filter clause output, if applicable
    if (filterExpression !== undefined) {
      const filterResult = resolveTemplateStrings({
        value: value[arrayForEachFilterKey],
        context: loopContext,
        contextOpts,
        source,
        path: path && [...path, arrayForEachFilterKey],
      })

      if (filterResult === false) {
        continue
      } else if (filterResult !== true) {
        throw new TemplateError({
          message: `${arrayForEachFilterKey} clause in ${arrayForEachKey} loop must resolve to a boolean value (got ${typeof resolvedInput})`,
          path: path && [...path, arrayForEachFilterKey],
          value,
          resolved: undefined,
        })
      }
    }

    output.push(
      resolveTemplateStrings({
        value: value[arrayForEachReturnKey],
        context: loopContext,
        contextOpts,
        source,
        path: path && [...path, arrayForEachKey, i],
      })
    )
  }

  // Need to resolve once more to handle e.g. $concat expressions
  return resolveTemplateStrings({ value: output, context, contextOpts, source, path })
}

const expectedConditionalKeys = [conditionalKey, conditionalThenKey, conditionalElseKey]

function handleConditional({
  value,
  context,
  contextOpts,
  path,
  source,
}: {
  value: any
  context: ConfigContext
  contextOpts: ContextResolveOpts
  path: ObjectPath | undefined
  source: ConfigSource | undefined
}) {
  // Validate input object
  const thenExpression = value[conditionalThenKey]
  const elseExpression = value[conditionalElseKey]

  if (thenExpression === undefined) {
    throw new TemplateError({
      message: `Missing ${conditionalThenKey} field next to ${conditionalKey} field. Got: ${naturalList(
        Object.keys(value)
      )}`,
      path,
      value,
      resolved: undefined,
    })
  }

  const unexpectedKeys = Object.keys(value).filter((k) => !expectedConditionalKeys.includes(k))

  if (unexpectedKeys.length > 0) {
    const extraKeys = naturalList(unexpectedKeys.map((k) => JSON.stringify(k)))

    throw new TemplateError({
      message: `Found one or more unexpected keys on ${conditionalKey} object: ${extraKeys}. Expected: ${naturalList(
        expectedConditionalKeys
      )}`,
      path,
      value,
      resolved: undefined,
    })
  }

  // Try resolving the value of the $if key
  const resolvedConditional = resolveTemplateStrings({
    value: value[conditionalKey],
    context,
    contextOpts,
    source,
    path: path && [...path, conditionalKey],
  })

  if (typeof resolvedConditional !== "boolean") {
    if (contextOpts.allowPartial) {
      return value
    } else {
      throw new TemplateError({
        message: `Value of ${conditionalKey} key must be (or resolve to) a boolean (got ${typeof resolvedConditional})`,
        path: path && [...path, conditionalKey],
        value,
        resolved: resolvedConditional,
      })
    }
  }

  // Note: We implicitly default the $else value to undefined

  const resolvedThen = resolveTemplateStrings({
    value: thenExpression,
    context,
    path: path && [...path, conditionalThenKey],
    contextOpts,
    source,
  })
  const resolvedElse = resolveTemplateStrings({
    value: elseExpression,
    context,
    path: path && [...path, conditionalElseKey],
    contextOpts,
    source,
  })

  if (!!resolvedConditional) {
    return resolvedThen
  } else {
    return resolvedElse
  }
}

/**
 * Returns `true` if the given value is a string and looks to contain a template string.
 */
export function maybeTemplateString(value: Primitive) {
  return !!value && typeof value === "string" && value.includes("${")
}

/**
 * Returns `true` if the given value or any value in a given object or array seems to contain a template string.
 */
export function mayContainTemplateString(obj: any): boolean {
  let out = false

  if (isPrimitive(obj)) {
    return maybeTemplateString(obj)
  }

  deepMap(obj, (v) => {
    if (maybeTemplateString(v)) {
      out = true
    }
  })

  return out
}

/**
 * Scans for all template strings in the given object and lists the referenced keys.
 */
export function collectTemplateReferences<T extends object>(obj: T): ContextKeySegment[][] {
  const context = new ScanContext()
  resolveTemplateStrings({ value: obj, context, contextOpts: { allowPartial: true }, source: undefined })
  return uniq(context.foundKeys.entries()).sort()
}

export function getRuntimeTemplateReferences<T extends object>(obj: T) {
  const refs = collectTemplateReferences(obj)
  return refs.filter((ref) => ref[0] === "runtime")
}

interface ActionTemplateReference extends ActionReference {
  fullRef: ContextKeySegment[]
}

/**
 * Collects every reference to another action in the given config object, including translated runtime.* references.
 * An error is thrown if a reference is not resolvable, i.e. if a nested template is used as a reference.
 *
 * TODO-0.13.1: Allow such nested references in certain cases, e.g. if resolvable with a ProjectConfigContext.
 */
export function getActionTemplateReferences<T extends object>(config: T): ActionTemplateReference[] {
  const rawRefs = collectTemplateReferences(config)

  // ${action.*}
  const refs: ActionTemplateReference[] = rawRefs
    .filter((ref) => ref[0] === "actions")
    .map((ref) => {
      if (!ref[1]) {
        throw new ConfigurationError({
          message: `Found invalid action reference (missing kind).`,
        })
      }
      if (!isString(ref[1])) {
        throw new ConfigurationError({
          message: `Found invalid action reference (kind is not a string).`,
        })
      }
      if (!actionKindsLower.includes(<any>ref[1])) {
        throw new ConfigurationError({
          message: `Found invalid action reference (invalid kind '${ref[1]}')`,
        })
      }

      if (!ref[2]) {
        throw new ConfigurationError({
          message: "Found invalid action reference (missing name)",
        })
      }
      if (!isString(ref[2])) {
        throw new ConfigurationError({
          message: "Found invalid action reference (name is not a string)",
        })
      }

      return {
        kind: <ActionKind>titleize(ref[1]),
        name: ref[2],
        fullRef: ref,
      }
    })

  // ${runtime.*}
  for (const ref of rawRefs) {
    if (ref[0] !== "runtime") {
      continue
    }

    let kind: ActionKind

    if (!ref[1]) {
      throw new ConfigurationError({
        message: "Found invalid runtime reference (missing kind)",
      })
    }
    if (!isString(ref[1])) {
      throw new ConfigurationError({
        message: "Found invalid runtime reference (kind is not a string)",
      })
    }

    if (ref[1] === "services") {
      kind = "Deploy"
    } else if (ref[1] === "tasks") {
      kind = "Run"
    } else {
      throw new ConfigurationError({
        message: `Found invalid runtime reference (invalid kind '${ref[1]}')`,
      })
    }

    if (!ref[2]) {
      throw new ConfigurationError({
        message: `Found invalid runtime reference (missing name)`,
      })
    }
    if (!isString(ref[2])) {
      throw new ConfigurationError({
        message: "Found invalid runtime reference (name is not a string)",
      })
    }

    refs.push({
      kind,
      name: ref[2],
      fullRef: ref,
    })
  }

  return refs
}

export function getModuleTemplateReferences<T extends object>(obj: T, context: ModuleConfigContext) {
  const refs = collectTemplateReferences(obj)
  const moduleNames = refs.filter((ref) => ref[0] === "modules" && ref.length > 1)
  // Resolve template strings in name refs. This would ideally be done ahead of this function, but is currently
  // necessary to resolve templated module name references in ModuleTemplates.
  return resolveTemplateStrings({ value: moduleNames, context, source: undefined })
}

/**
 * Gathers secret references in configs and throws an error if one or more referenced secrets isn't present (or has
 * blank values) in the provided secrets map.
 *
 * Prefix should be e.g. "Module" or "Provider" (used when generating error messages).
 *
 * TODO: We've disabled this for now. Re-introduce once we've removed get config command call from GE!
 */
export function throwOnMissingSecretKeys(configs: ObjectWithName[], secrets: StringMap, prefix: string, log?: Log) {
  const allMissing: [string, ContextKeySegment[]][] = [] // [[key, missing keys]]
  for (const config of configs) {
    const missing = detectMissingSecretKeys(config, secrets)
    if (missing.length > 0) {
      allMissing.push([config.name, missing])
    }
  }

  if (allMissing.length === 0) {
    return
  }

  const descriptions = allMissing.map(([key, missing]) => `${prefix} ${key}: ${missing.join(", ")}`)
  /**
   * Secret keys with empty values should have resulted in an error by this point, but we filter on keys with
   * values for good measure.
   */
  const loadedKeys = Object.entries(secrets)
    .filter(([_key, value]) => value)
    .map(([key, _value]) => key)
  let footer: string
  if (loadedKeys.length === 0) {
    footer = deline`
      Note: No secrets have been loaded. If you have defined secrets for the current project and environment in Garden
      Cloud, this may indicate a problem with your configuration.
    `
  } else {
    footer = `Secret keys with loaded values: ${loadedKeys.join(", ")}`
  }
  const errMsg = dedent`
    The following secret names were referenced in configuration, but are missing from the secrets loaded remotely:

    ${descriptions.join("\n\n")}

    ${footer}
  `
  if (log) {
    log.silly(() => errMsg)
  }
  // throw new ConfigurationError(errMsg, {
  //   loadedSecretKeys: loadedKeys,
  //   missingSecretKeys: uniq(flatten(allMissing.map(([_key, missing]) => missing))),
  // })
}

/**
 * Collects template references to secrets in obj, and returns an array of any secret keys referenced in it that
 * aren't present (or have blank values) in the provided secrets map.
 */
export function detectMissingSecretKeys<T extends object>(obj: T, secrets: StringMap): ContextKeySegment[] {
  const referencedKeys = collectTemplateReferences(obj)
    .filter((ref) => ref[0] === "secrets")
    .map((ref) => ref[1])
  /**
   * Secret keys with empty values should have resulted in an error by this point, but we filter on keys with
   * values for good measure.
   */
  const keysWithValues = Object.entries(secrets)
    .filter(([_key, value]) => value)
    .map(([key, _value]) => key)
  const missingKeys = difference(referencedKeys, keysWithValues)
  return missingKeys.sort()
}

function buildBinaryExpression(head: any, tail: any) {
  return tail.reduce((result: any, element: any) => {
    const operator = element[1]
    const leftRes = result
    const rightRes = element[3]

    // We need to manually handle and propagate errors because the parser doesn't support promises
    if (leftRes && leftRes._error) {
      return leftRes
    }
    if (rightRes && rightRes._error) {
      return rightRes
    }
    const left = getValue(leftRes)
    const right = getValue(rightRes)

    // if any operand is partially resolved, preserve the original expression
    const leftResPartial = isPartiallyResolved(leftRes)
    const rightResPartial = isPartiallyResolved(rightRes)
    if (leftResPartial || rightResPartial) {
      return `${left} ${operator} ${right}`
    }

    // Disallow undefined values for comparisons
    if (left === undefined || right === undefined) {
      const message = [leftRes, rightRes]
        .map((res) => res?.message)
        .filter(Boolean)
        .join(" ")
      const err = new TemplateStringError({
        message: message || "Could not resolve one or more keys.",
      })
      return { _error: err }
    }

    if (operator === "==") {
      return left === right
    }
    if (operator === "!=") {
      return left !== right
    }

    if (operator === "+") {
      if (isNumber(left) && isNumber(right)) {
        return left + right
      } else if (isString(left) && isString(right)) {
        return left + right
      } else if (Array.isArray(left) && Array.isArray(right)) {
        return left.concat(right)
      } else {
        const err = new TemplateStringError({
          message: `Both terms need to be either arrays or strings or numbers for + operator (got ${typeof left} and ${typeof right}).`,
        })
        return { _error: err }
      }
    }

    // All other operators require numbers to make sense (we're not gonna allow random JS weirdness)
    if (!isNumber(left) || !isNumber(right)) {
      const err = new TemplateStringError({
        message: `Both terms need to be numbers for ${operator} operator (got ${typeof left} and ${typeof right}).`,
      })
      return { _error: err }
    }

    switch (operator) {
      case "*":
        return left * right
      case "/":
        return left / right
      case "%":
        return left % right
      case "-":
        return left - right
      case "<=":
        return left <= right
      case ">=":
        return left >= right
      case "<":
        return left < right
      case ">":
        return left > right
      default:
        const err = new TemplateStringError({ message: "Unrecognized operator: " + operator })
        return { _error: err }
    }
  }, head)
}

function buildLogicalExpression(head: any, tail: any, opts: ContextResolveOpts) {
  return tail.reduce((result: any, element: any) => {
    const operator = element[1]
    const leftRes = result
    const rightRes = element[3]

    switch (operator) {
      case "&&":
        if (leftRes && leftRes._error) {
          if (!opts.allowPartial && leftRes._error.type === missingKeyExceptionType) {
            return false
          }
          return leftRes
        }

        const leftValue = getValue(leftRes)

        if (leftValue === undefined) {
          return { resolved: false }
        } else if (!leftValue) {
          return { resolved: leftValue }
        } else {
          if (rightRes && rightRes._error) {
            if (!opts.allowPartial && rightRes._error.type === missingKeyExceptionType) {
              return false
            }
            return rightRes
          }

          const rightValue = getValue(rightRes)

          if (rightValue === undefined) {
            return { resolved: false }
          } else {
            return rightRes
          }
        }
      case "||":
        if (leftRes && leftRes._error) {
          return leftRes
        }
        return getValue(leftRes) ? leftRes : rightRes
      default:
        const err = new TemplateStringError({ message: "Unrecognized operator: " + operator })
        return { _error: err }
    }
  }, head)
}
