/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import lodash from "lodash"
import { deepMap } from "./util/util"
import { GardenBaseError, ConfigurationError } from "./exceptions"
import { ConfigContext, ContextResolveOpts, ScanContext, ContextResolveOutput } from "./config/config-context"
import { uniq, isPlainObject, isNumber } from "lodash"
import { Primitive } from "./config/common"
import { profile } from "./util/profiling"

export type StringOrStringPromise = Promise<string> | string

class TemplateStringError extends GardenBaseError {
  type = "template-string"
}

let _parser: any

function getParser() {
  if (!_parser) {
    _parser = require("./template-string-parser")
  }

  return _parser
}

type ResolvedClause = ContextResolveOutput | { resolved: undefined; _error: Error }

function getValue(v: Primitive | undefined | ResolvedClause) {
  return isPlainObject(v) ? (<ResolvedClause>v).resolved : v
}

/**
 * Parse and resolve a templated string, with the given context. The template format is similar to native JS templated
 * strings but only supports simple lookups from the given context, e.g. "prefix-${nested.key}-suffix", and not
 * arbitrary JS code.
 *
 * The context should be a ConfigContext instance. The optional `stack` parameter is used to detect circular
 * dependencies when resolving context variables.
 */
export function resolveTemplateString(string: string, context: ConfigContext, opts: ContextResolveOpts = {}): any {
  if (!string) {
    return string
  }

  const parser = getParser()
  try {
    const parsed = parser.parse(string, {
      getKey: (key: string[], resolveOpts?: ContextResolveOpts) => {
        return context.resolve({ key, nodePath: [], opts: { ...opts, ...(resolveOpts || {}) } })
      },
      getValue,
      resolveNested: (nested: string) => resolveTemplateString(nested, context, opts),
      // Some utilities to pass to the parser
      buildBinaryExpression,
      buildLogicalExpression,
      lodash,
      ConfigurationError,
      TemplateStringError,
      allowUndefined: opts.allowUndefined,
      optionalSuffix: "}?",
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
      resolved = outputs
        .map((output) => {
          const v = getValue(output)
          return v === null ? "null" : v
        })
        .join("")
    }

    return resolved
  } catch (err) {
    const prefix = `Invalid template string ${string}: `
    const message = err.message.startsWith(prefix) ? err.message : prefix + err.message

    throw new TemplateStringError(message, {
      err,
    })
  }
}

/**
 * Recursively parses and resolves all templated strings in the given object.
 */
export const resolveTemplateStrings = profile(function $resolveTemplateStrings<T extends object>(
  obj: T,
  context: ConfigContext,
  opts: ContextResolveOpts = {}
): T {
  return deepMap(obj, (v) => (typeof v === "string" ? resolveTemplateString(v, context, opts) : v)) as T
})

/**
 * Scans for all template strings in the given object and lists the referenced keys.
 */
export function collectTemplateReferences<T extends object>(obj: T): string[][] {
  const context = new ScanContext()
  resolveTemplateStrings(obj, context)
  return uniq(context.foundKeys.entries()).sort()
}

export function getRuntimeTemplateReferences<T extends object>(obj: T) {
  const refs = collectTemplateReferences(obj)
  return refs.filter((ref) => ref[0] === "runtime")
}

export function getModuleTemplateReferences<T extends object>(obj: T) {
  const refs = collectTemplateReferences(obj)
  return refs.filter((ref) => ref[0] === "modules" && ref.length > 1)
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

    // Disallow undefined values for comparisons
    if (left === undefined || right === undefined) {
      const message = [leftRes, rightRes]
        .map((res) => res.message)
        .filter(Boolean)
        .join(" ")
      const err = new TemplateStringError(message || "Could not resolve one or more keys.", {
        left,
        right,
        operator,
      })
      return { _error: err }
    }

    if (operator === "==") {
      return left === right
    }
    if (operator === "!=") {
      return left !== right
    }

    // All other operators require numbers to make sense (we're not gonna allow random JS weirdness)
    if (!isNumber(left) || !isNumber(right)) {
      const err = new TemplateStringError(
        `Both terms need to be numbers for ${operator} operator (got ${typeof left} and ${typeof right}).`,
        { left, right, operator }
      )
      return { _error: err }
    }

    switch (operator) {
      case "*":
        return left * right
      case "/":
        return left / right
      case "%":
        return left % right
      case "+":
        return left + right
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
        const err = new TemplateStringError("Unrecognized operator: " + operator, { operator })
        return { _error: err }
    }
  }, head)
}

function buildLogicalExpression(head: any, tail: any) {
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

    switch (operator) {
      case "&&":
        return !left ? leftRes : rightRes
      case "||":
        return left ? leftRes : rightRes
      default:
        const err = new TemplateStringError("Unrecognized operator: " + operator, { operator })
        return { _error: err }
    }
  }, head)
}
