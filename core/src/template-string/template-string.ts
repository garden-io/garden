/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenErrorParams } from "../exceptions.js"
import { ConfigurationError, GardenError, InternalError, TemplateStringError } from "../exceptions.js"
import type {
  ConfigContext,
  ContextKeySegment,
  ContextResolveOpts,
  ObjectPath,
} from "../config/template-contexts/base.js"
import { ScanContext } from "../config/template-contexts/base.js"
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
  objectSpreadKey,
} from "../config/common.js"
import { dedent, deline, naturalList, titleize, truncate } from "../util/string.js"
import type { ObjectWithName } from "../util/util.js"
import type { Log } from "../logger/log-entry.js"
import type { ModuleConfigContext } from "../config/template-contexts/module.js"
import type { ActionKind } from "../actions/types.js"
import { actionKindsLower } from "../actions/types.js"
import { type CollectionOrValue, deepMap, isArray } from "../util/objects.js"
import type { ConfigSource } from "../config/validation.js"
import * as parser from "./parser.js"
import * as ast from "./ast.js"
import { styles } from "../logger/styles.js"
import { TemplateLeaf, isTemplateLeafValue } from "./inputs.js"
import type { TemplateLeafValue, TemplateValue } from "./inputs.js"
import { ConcatLazyValue, ForEachLazyValue, TemplateStringLazyValue, deepUnwrap } from "./lazy.js"

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

export function resolveTemplateString({
  string,
  context,
  contextOpts = {},
}: {
  string: string
  context: ConfigContext
  contextOpts?: ContextResolveOpts
}): any {
  const result = resolveTemplateStringWithInputs({ string, context, contextOpts })
  return deepUnwrap({ value: result, context, opts: contextOpts })
}

function parseTemplateString(string: string, unescape: boolean = false) {
  const parsed: ast.TemplateExpression = parser.parse(string, {
    ast,
    TemplateStringError,
    // TODO: What is unescape?
    unescape,
    escapePrefix,
    optionalSuffix: "}?",
    // TODO: This should not be done via recursion, but should be handled in the pegjs grammar.
    parseNested: (nested: string) => {
      return parseTemplateString(nested, unescape)
    },
  })

  return parsed
}

/**
 * Parse and resolve a templated string, with the given context. The template format is similar to native JS templated
 * strings but only supports simple lookups from the given context, e.g. "prefix-${nested.key}-suffix", and not
 * arbitrary JS code.
 *
 * The context should be a ConfigContext instance. The optional `stack` parameter is used to detect circular
 * dependencies when resolving context variables.
 *
 * TODO: Update docstring to also talk about resolved reference tracking.
 */
export function resolveTemplateStringWithInputs({
  string,
  // TODO: remove context and contextOpts
  context: _context,
  contextOpts = {},
}: {
  string: string
  context: ConfigContext
  contextOpts?: ContextResolveOpts
}): CollectionOrValue<TemplateValue> {
  // Just return immediately if this is definitely not a template string
  if (!maybeTemplateString(string)) {
    return new TemplateLeaf({
      expr: undefined,
      value: string,
      inputs: {},
    })
  }

  try {
    const parsed = parseTemplateString(string, contextOpts?.unescape || false)

    return new TemplateStringLazyValue({
      astRootNode: parsed,
      expr: string,
    })
  } catch (err) {
    if (!(err instanceof GardenError)) {
      throw err
    }
    const prefix = `Invalid template string (${styles.accent(truncate(string, 35).replace(/\n/g, "\\n"))}): `
    const message = err.message.startsWith(prefix) ? err.message : prefix + err.message

    throw new TemplateStringError({ message, path: contextOpts.yamlPath })
  }
}

/**
 * Returns a new ContextResolveOpts where part is appended to both yamlPath and resultPath
 *
 * @param part ObjectPath element to append to yamlPath and resultPath in contextOpts
 * @param contextOpts ContextResolveOpts
 * @returns
 */
function pushPath(part: ObjectPath[0], contextOpts: ContextResolveOpts) {
  return pushResultPath(part, pushYamlPath(part, contextOpts))
}

/**
 * Returns a new ContextResolveOpts where part is appended to only resultPath in contextOpts
 *
 * @param part ObjectPath element to append to resultPath in contextOpts
 * @param contextOpts ContextResolveOpts
 * @returns
 */
function pushResultPath<T extends { resultPath?: ObjectPath }>(
  part: ObjectPath[0],
  contextOpts: T
): T & { resultPath: ObjectPath } {
  return {
    ...contextOpts,
    resultPath: [...(contextOpts.resultPath || []), part],
  }
}
/**
 * Returns a new ContextResolveOpts where part is appended to only yamlPath in contextOpts
 *
 * @param part ObjectPath element to append to yamlPath in contextOpts
 * @param contextOpts ContextResolveOpts
 * @returns
 */
function pushYamlPath<T extends { yamlPath?: ObjectPath }>(
  part: ObjectPath[0],
  contextOpts: T
): T & { yamlPath: ObjectPath } {
  return {
    ...contextOpts,
    yamlPath: [...(contextOpts.yamlPath || []), part],
  }
}

/**
 * Recursively parses and resolves all templated strings in the given object.
 */

export function resolveTemplateStringsWithInputs({
  value,
  context,
  contextOpts = {},
  source,
}: {
  value: CollectionOrValue<TemplateLeafValue>
  context: ConfigContext
  contextOpts?: ContextResolveOpts
  source: ConfigSource | undefined
}): CollectionOrValue<TemplateValue> {
  if (!contextOpts.yamlPath) {
    contextOpts.yamlPath = []
  }

  // TODO: we can remove resultPath tracking
  if (!contextOpts.resultPath) {
    contextOpts.resultPath = []
  }

  if (typeof value === "string") {
    return resolveTemplateStringWithInputs({ string: value, context, contextOpts })
  } else if (isTemplateLeafValue(value)) {
    // here we handle things static numbers, empty array etc
    // we also handle null and undefined
    return new TemplateLeaf({
      expr: undefined,
      value,
      inputs: {},
    })
  } else if (isArray(value)) {
    const resolvedValues = value.map((v, i) =>
      resolveTemplateStringsWithInputs({ value: v, context, contextOpts: pushYamlPath(i, contextOpts), source })
    )
    // we know that this is not handling an empty array, as that would have been a TemplatePrimitive.
    if (value.some((v) => v?.[arrayConcatKey] !== undefined)) {
      return new ConcatLazyValue(resolvedValues)
    } else {
      return resolvedValues
    }
  } else if (isPlainObject(value)) {
    if (value[arrayForEachKey] !== undefined) {
      const unexpectedKeys = Object.keys(value).filter((k) => !ForEachLazyValue.allowedForEachKeys.includes(k))

      if (unexpectedKeys.length > 0) {
        const extraKeys = naturalList(unexpectedKeys.map((k) => JSON.stringify(k)))

        throw new TemplateError({
          message: `Found one or more unexpected keys on ${arrayForEachKey} object: ${extraKeys}. Allowed keys: ${naturalList(
            ForEachLazyValue.allowedForEachKeys
          )}`,
          // path: contextOpts.yamlPath,
          // value,
          // resolved: undefined,
          path: [],
          value: undefined,
          resolved: undefined,
        })
      }

      const resolvedCollectionExpression = resolveTemplateStringsWithInputs({
        value: value[arrayForEachKey],
        context,
        contextOpts: pushYamlPath(arrayForEachKey, contextOpts),
        source,
      })
      const resolvedReturnExpression = resolveTemplateStringsWithInputs({
        value: value[arrayForEachReturnKey],
        context,
        contextOpts: pushYamlPath(arrayForEachReturnKey, contextOpts),
        source,
      })
      const resolvedFilterExpression = resolveTemplateStringsWithInputs({
        value: value[arrayForEachFilterKey],
        context,
        contextOpts: pushYamlPath(arrayForEachFilterKey, contextOpts),
        source,
      })
      return new ForEachLazyValue({
        [arrayForEachKey]: resolvedCollectionExpression,
        [arrayForEachReturnKey]: resolvedReturnExpression,
        [arrayForEachFilterKey]: resolvedFilterExpression,
      })
    } else if (value[conditionalKey] !== undefined) {
      // Handle $if conditional
      return handleConditional({ value, context, contextOpts, source })
    } else {
      // Resolve $merge keys, depth-first, leaves-first
      let output = {}

      for (const [k, v] of Object.entries(value)) {
        let mergeResolveOpts: ContextResolveOpts
        if (k === objectSpreadKey) {
          mergeResolveOpts = pushYamlPath(objectSpreadKey, contextOpts)
        } else {
          mergeResolveOpts = pushPath(k, contextOpts)
        }
        const resolved = resolveTemplateStringsWithInputs({
          value: v,
          context,
          contextOpts: mergeResolveOpts,
          source,
        })

        if (k === objectSpreadKey) {
          if (isPlainObject(resolved)) {
            output = { ...output, ...resolved }
          } else if (contextOpts.allowPartial) {
            output[k] = resolved
          } else {
            throw new TemplateError({
              message: `Value of ${objectSpreadKey} key must be (or resolve to) a mapping object (got ${typeof resolved})`,
              path: pushResultPath(k, contextOpts).yamlPath,
              value,
              resolved,
            })
          }
        } else {
          output[k] = resolved
        }
      }

      return output
    }
  } else {
    throw new InternalError({
      message: `Got unexpected value type: ${typeof value}`,
    })
  }
}

// `extends any` here isn't pretty but this function is hard to type correctly
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
// TODO: use TemplateCollectionOrValue<TemplatePrimitive> instead of T; T is lying here, as is any.
export function resolveTemplateStrings<T = any>({
  value,
  context,
  contextOpts = {},
  source,
}: {
  value: T
  context: ConfigContext
  contextOpts?: ContextResolveOpts
  source: ConfigSource | undefined
}): T {
  const resolved = resolveTemplateStringsWithInputs({ value: value as any, context, contextOpts, source })
  // First evaluate lazy values deeply, then remove the leaves
  return deepUnwrap({ value: resolved, context, opts: contextOpts }) as any // TODO: The type is a lie!
}

const expectedConditionalKeys = [conditionalKey, conditionalThenKey, conditionalElseKey]

function handleConditional({
  value,
  context,
  contextOpts,
  source,
}: {
  value: any
  context: ConfigContext
  contextOpts: ContextResolveOpts
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
      path: contextOpts.yamlPath,
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
      path: contextOpts.yamlPath,
      value,
      resolved: undefined,
    })
  }

  // Try resolving the value of the $if key
  const resolvedConditional = resolveTemplateStrings({
    value: value[conditionalKey],
    context,
    contextOpts: pushYamlPath(conditionalKey, contextOpts),
    source,
  })

  if (typeof resolvedConditional !== "boolean") {
    if (contextOpts.allowPartial) {
      return value
    } else {
      throw new TemplateError({
        message: `Value of ${conditionalKey} key must be (or resolve to) a boolean (got ${typeof resolvedConditional})`,
        path: pushYamlPath(conditionalKey, contextOpts).yamlPath,
        value,
        resolved: resolvedConditional,
      })
    }
  }

  // Note: We implicitly default the $else value to undefined

  const resolvedThen = resolveTemplateStrings({
    value: thenExpression,
    context,
    contextOpts: pushYamlPath(conditionalThenKey, contextOpts),
    source,
  })
  const resolvedElse = resolveTemplateStrings({
    value: elseExpression,
    context,
    contextOpts: pushYamlPath(conditionalElseKey, contextOpts),
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
