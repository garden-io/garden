/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenErrorParams } from "../exceptions.js"
import {
  ConfigurationError,
  GardenError,
  InternalError,
  NotImplementedError,
  TemplateStringError,
} from "../exceptions.js"
import type {
  ConfigContext,
  ContextKeySegment,
  ContextResolveOpts,
  ObjectPath,
} from "../config/template-contexts/base.js"
import { ScanContext } from "../config/template-contexts/base.js"
import { difference, isPlainObject, isString, mapValues, uniq } from "lodash-es"
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
import { dedent, deline, naturalList, titleize } from "../util/string.js"
import type { ObjectWithName } from "../util/util.js"
import type { Log } from "../logger/log-entry.js"
import type { ModuleConfigContext } from "../config/template-contexts/module.js"
import type { ActionKind } from "../actions/types.js"
import { actionKindsLower } from "../actions/types.js"
import { type CollectionOrValue, deepMap, isArray } from "../util/objects.js"
import * as parser from "./parser.js"
import * as ast from "./ast.js"
import { TemplateLeaf, isTemplateLeafValue } from "./inputs.js"
import type { TemplateLeafValue, TemplateValue } from "./inputs.js"
import {
  ConcatLazyValue,
  ConditionalLazyValue,
  ForEachLazyValue,
  ObjectSpreadLazyValue,
  ObjectSpreadOperation,
  TemplateStringLazyValue,
  deepEvaluateAndUnwrap,
} from "./lazy.js"
import { ConfigSource } from "../config/validation.js"
import { Optional } from "utility-types"

const escapePrefix = "$${"

type TemplateErrorParams = {
  message: string
  source: TemplateProvenance
}

export class TemplateError extends GardenError {
  type = "template"

  constructor(params: TemplateErrorParams) {
    // TODO: use params.source to improve error message quality
    super({ message: params.message })
  }
}

export type TemplateProvenance = {
  yamlPath: ObjectPath
  source: ConfigSource | undefined
}

export function resolveTemplateString({
  string,
  context,
  contextOpts,
  source,
}: {
  string: string
  context: ConfigContext
  contextOpts?: ContextResolveOpts
  source?: TemplateProvenance
}): any {
  const result = parseTemplateString({ string, source, unescape: contextOpts?.unescape })
  return deepEvaluateAndUnwrap({ value: result, context, opts: contextOpts || {} })
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
export function parseTemplateString({
  string,
  source,
  // TODO: remove unescape
  unescape = false,
}: {
  string: string
  source?: TemplateProvenance
  unescape?: boolean
}): CollectionOrValue<TemplateValue> {
  if (source === undefined) {
    source = {
      yamlPath: [],
      source: undefined,
    }
  }

  // Just return immediately if this is definitely not a template string
  if (!maybeTemplateString(string)) {
    return new TemplateLeaf({
      expr: undefined,
      value: string,
      inputs: {},
    })
  }

  const parse = (str: string) => {
    const parsed: ast.TemplateExpression = parser.parse(str, {
      grammarSource: source,
      rawTemplateString: string,
      ast,
      TemplateStringError,
      // TODO: What is unescape?
      unescape,
      escapePrefix,
      optionalSuffix: "}?",
      // TODO: This should not be done via recursion, but should be handled in the pegjs grammar.
      parseNested: (nested: string) => {
        return parse(nested)
      },
    })

    return parsed
  }


  const parsed = parse(string)

  return new TemplateStringLazyValue({
    source,
    astRootNode: parsed,
    expr: string,
  })
}

/**
 * Returns a new ContextResolveOpts where part is appended to only yamlPath in contextOpts
 *
 * @param part ObjectPath element to append to yamlPath in contextOpts
 * @param contextOpts ContextResolveOpts
 * @returns
 */
export function pushYamlPath<T extends { yamlPath?: ObjectPath }>(
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

export function parseTemplateCollection({
  value,
  source: _source,
}: {
  value: CollectionOrValue<TemplateLeafValue>
  source: Optional<TemplateProvenance, "yamlPath">
}): CollectionOrValue<TemplateValue> {
  let source: TemplateProvenance = {
    ..._source,
    yamlPath: _source.yamlPath || [],
  }

  if (typeof value === "string") {
    return parseTemplateString({ string: value, source })
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
      parseTemplateCollection({ value: v, source: pushYamlPath(i, source) })
    )
    // we know that this is not handling an empty array, as that would have been a TemplatePrimitive.
    if (value.some((v) => v?.[arrayConcatKey] !== undefined)) {
      return new ConcatLazyValue(source, resolvedValues)
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
          source: pushYamlPath(extraKeys[0], source),
        })
      }

      if (value[arrayForEachReturnKey] === undefined) {
        throw new TemplateError({
          message: `Missing ${arrayForEachReturnKey} field next to ${arrayForEachKey} field. Got ${naturalList(
            Object.keys(value)
          )}`,
          source: pushYamlPath(arrayForEachReturnKey, source),
        })
      }

      const resolvedCollectionExpression = parseTemplateCollection({
        value: value[arrayForEachKey],
        source: pushYamlPath(arrayForEachKey, source),
      })

      const resolvedReturnExpression = parseTemplateCollection({
        value: value[arrayForEachReturnKey],
        source: pushYamlPath(arrayForEachReturnKey, source),
      })


      const resolvedFilterExpression =
        value[arrayForEachFilterKey] === undefined
          ? undefined
          : parseTemplateCollection({
              value: value[arrayForEachFilterKey],
              source: pushYamlPath(arrayForEachFilterKey, source),
            })

      const forEach = new ForEachLazyValue(source, {
        [arrayForEachKey]: resolvedCollectionExpression,
        [arrayForEachReturnKey]: resolvedReturnExpression,
        [arrayForEachFilterKey]: resolvedFilterExpression,
      })

      // This ensures that we only handle $concat operators that literally are hardcoded in the yaml,
      // and not ones that are results of other expressions.
      if (resolvedReturnExpression[arrayConcatKey] !== undefined) {
        return new ConcatLazyValue(source, forEach)
      } else {
        return forEach
      }
    } else if (value[conditionalKey] !== undefined) {
      const ifExpression = value[conditionalKey]
      const thenExpression = value[conditionalThenKey]
      const elseExpression = value[conditionalElseKey]

      if (thenExpression === undefined) {
        throw new TemplateError({
          message: `Missing ${conditionalThenKey} field next to ${conditionalKey} field. Got: ${naturalList(
            Object.keys(value)
          )}`,
          source,
        })
      }

      const unexpectedKeys = Object.keys(value).filter((k) => !ConditionalLazyValue.allowedConditionalKeys.includes(k))

      if (unexpectedKeys.length > 0) {
        const extraKeys = naturalList(unexpectedKeys.map((k) => JSON.stringify(k)))

        throw new TemplateError({
          message: `Found one or more unexpected keys on ${conditionalKey} object: ${extraKeys}. Allowed: ${naturalList(
            ConditionalLazyValue.allowedConditionalKeys
          )}`,
          source,
        })
      }

      return new ConditionalLazyValue(source, {
        [conditionalKey]: parseTemplateCollection({
          value: ifExpression,
          source: pushYamlPath(conditionalKey, source),
        }),
        [conditionalThenKey]: parseTemplateCollection({
          value: thenExpression,
          source: pushYamlPath(conditionalThenKey, source),
        }),
        [conditionalElseKey]:
          elseExpression === undefined
            ? undefined
            : parseTemplateCollection({
                value: elseExpression,
                source: pushYamlPath(conditionalElseKey, source),
              }),
      })
    } else {
      const resolved = mapValues(value, (v, k) =>
        parseTemplateCollection({ value: v, source: pushYamlPath(k, source) })
      )
      if (Object.keys(value).some((k) => k === objectSpreadKey)) {
        return new ObjectSpreadLazyValue(source, resolved as ObjectSpreadOperation)
      } else {
        return resolved
      }
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
  contextOpts,
  source: _source,
}: {
  value: T
  context: ConfigContext
  contextOpts?: ContextResolveOpts
  source?: ConfigSource | undefined
}): T {
  const source = {
    yamlPath: [],
    source: _source,
  }
  const resolved = parseTemplateCollection({ value: value as any, source })
  // First evaluate lazy values deeply, then remove the leaves
  return deepEvaluateAndUnwrap({ value: resolved, context, opts: contextOpts || {} }) as any // TODO: The type is a lie!
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
  throw new NotImplementedError({ message: "TODO: Traverse ast to get references" })
  // const context = new ScanContext()
  // resolveTemplateStrings({ value: obj, context, contextOpts: { allowPartial: true,  } })
  // return uniq(context.foundKeys.entries()).sort()
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
