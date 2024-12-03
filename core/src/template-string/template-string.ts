/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenErrorParams } from "../exceptions.js"
import { ConfigurationError, GardenError, InternalError, TemplateStringError } from "../exceptions.js"
import type { ConfigContext, ContextKeySegment, ContextResolveOpts } from "../config/template-contexts/base.js"
import { CONTEXT_RESOLVE_KEY_NOT_FOUND, GenericContext, ScanContext } from "../config/template-contexts/base.js"
import cloneDeep from "fast-copy"
import { difference, isPlainObject, isString, uniq } from "lodash-es"
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
import { dedent, deline, naturalList, titleize } from "../util/string.js"
import type { ObjectWithName } from "../util/util.js"
import type { Log } from "../logger/log-entry.js"
import type { ModuleConfigContext } from "../config/template-contexts/module.js"
import type { ActionKind } from "../actions/types.js"
import { actionKindsLower } from "../actions/types.js"
import type { CollectionOrValue } from "../util/objects.js"
import { deepMap } from "../util/objects.js"
import type { ConfigSource } from "../config/validation.js"
import * as parser from "./parser.js"
import type { ObjectPath } from "../config/base.js"
import type { TemplatePrimitive } from "./types.js"
import * as ast from "./ast.js"
import { LRUCache } from "lru-cache"

const escapePrefix = "$${"

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

type ParseParams = Parameters<typeof parser.parse>
function parseWithPegJs(params: ParseParams) {
  return parser.parse(...params)
}

const shouldUnescape = (ctxOpts: ContextResolveOpts) => {
  // Explicit non-escaping takes the highest priority.
  if (ctxOpts.unescape === false) {
    return false
  }

  return !!ctxOpts.unescape || !ctxOpts.allowPartial
}

const parseTemplateStringCache = new LRUCache<string, string | ast.TemplateExpression>({
  max: 100000,
})

export function parseTemplateString({
  rawTemplateString,
  source,
  unescape,
}: {
  rawTemplateString: string
  source?: ConfigSource
  unescape: boolean
}): string | ast.TemplateExpression {
  if (!unescape) {
    const cached = parseTemplateStringCache.get(rawTemplateString)

    if (cached) {
      return cached
    }
  }

  // Just return immediately if this is definitely not a template string
  if (!maybeTemplateString(rawTemplateString)) {
    if (!unescape) {
      parseTemplateStringCache.set(rawTemplateString, rawTemplateString)
    }
    return rawTemplateString
  }

  if (source === undefined) {
    source = {
      basePath: [],
      yamlDoc: undefined,
    }
  }

  const parsed = parseWithPegJs([
    rawTemplateString,
    {
      ast,
      escapePrefix,
      optionalSuffix: "}?",
      parseNested: (nested: string) => parseTemplateString({ rawTemplateString: nested, source, unescape }),
      TemplateStringError,
      unescape,
    },
  ])

  if (!unescape) {
    parseTemplateStringCache.set(rawTemplateString, parsed)
  }

  return parsed
}

/**
 * Parse and resolve a templated string, with the given context. The template format is similar to native JS templated
 * strings but only supports simple lookups from the given context, e.g. "prefix-${nested.key}-suffix", and not
 * arbitrary JS code.
 *
 * The context should be a ConfigContext instance. The optional `stack` parameter is used to detect circular
 * dependencies when resolving context variables.
 */
export function resolveTemplateString({
  string,
  context,
  contextOpts = {},
  // TODO: Path and source? what to do with path here?
  path,
  source,
}: {
  string: string
  context: ConfigContext
  contextOpts?: ContextResolveOpts
  source?: ConfigSource
  path?: ObjectPath
}): CollectionOrValue<TemplatePrimitive> {
  const parsed = parseTemplateString({
    rawTemplateString: string,
    source,
    // TODO: remove unescape hacks.
    unescape: shouldUnescape(contextOpts),
  })

  if (parsed instanceof ast.TemplateExpression) {
    const result = parsed.evaluate({
      rawTemplateString: string,
      context,
      opts: contextOpts,
    })

    if (!contextOpts.allowPartial && result === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
      throw new InternalError({
        message: "allowPartial is false, but template expression evaluated to symbol.",
      })
    } else if (result === CONTEXT_RESOLVE_KEY_NOT_FOUND) {
      // The template expression cannot be evaluated yet, we may be able to do it later.
      // TODO: return ast.TemplateExpression here, instead of string; Otherwise we'll inevitably have a bug
      // where garden will resolve template expressions that might be contained in expression evaluation results
      // e.g. if an environment variable contains template string, we don't want to evaluate the template string in there.
      // See also https://github.com/garden-io/garden/issues/5825
      return string
    }

    return result
  }

  // string does not contain a template expression
  return parsed
}

/**
 * Recursively parses and resolves all templated strings in the given object.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export function resolveTemplateStrings<T>({
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
    return <T>resolveTemplateString({ string: value, context, path, source, contextOpts })
  } else if (Array.isArray(value)) {
    const output: unknown[] = []

    for (let i = 0; i < value.length; i++) {
      const v = value[i]
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
    }

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

      for (const k in value as Record<string, unknown>) {
        const v = value[k]
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
}

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
export function collectTemplateReferences(obj: object): ContextKeySegment[][] {
  // TODO: Statically analyse AST instead of using ScanContext
  const context = new ScanContext()
  resolveTemplateStrings({ value: obj, context, contextOpts: { allowPartial: true }, source: undefined })
  return uniq(context.foundKeys.entries()).sort()
}

export function getRuntimeTemplateReferences(obj: object) {
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
export function getActionTemplateReferences(config: object): ActionTemplateReference[] {
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

export function getModuleTemplateReferences(obj: object, context: ModuleConfigContext) {
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
export function detectMissingSecretKeys(obj: object, secrets: StringMap): ContextKeySegment[] {
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
