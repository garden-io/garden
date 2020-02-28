/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import lodash = require("lodash")
import Bluebird = require("bluebird")
import { asyncDeepMap } from "./util/util"
import { GardenBaseError, ConfigurationError } from "./exceptions"
import { ConfigContext, ContextResolveOpts, ScanContext, ContextResolveOutput } from "./config/config-context"
import { uniq, isPlainObject, isNumber } from "lodash"
import { Primitive, isPrimitive } from "./config/common"

export type StringOrStringPromise = Promise<string> | string

class TemplateStringError extends GardenBaseError {
  type = "template-string"
}

let _parser: any

async function getParser() {
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
export async function resolveTemplateString(
  string: string,
  context: ConfigContext,
  opts: ContextResolveOpts = {}
): Promise<Primitive | undefined> {
  if (!string) {
    return string
  }

  const parser = await getParser()
  try {
    const parsed = parser.parse(string, {
      getKey: async (key: string[], resolveOpts?: ContextResolveOpts) => {
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

    const outputs: ResolvedClause[] = await Bluebird.map(parsed, async (p: any) => {
      const res = await p
      return isPlainObject(res) ? res : { resolved: getValue(res) }
    })

    // We need to manually propagate errors in the parser, so we catch them here
    for (const r of outputs) {
      if (r && r["_error"]) {
        throw r["_error"]
      }
    }

    // Use value directly if there is only one (or no) value in the output.
    let resolved: Primitive | undefined = outputs[0]?.resolved

    if (outputs.length > 1) {
      resolved = outputs
        .map((output) => {
          const v = getValue(output)
          return v === null ? "null" : v
        })
        .join("")
    }

    if (resolved !== undefined && !isPrimitive(resolved)) {
      throw new ConfigurationError(
        `Template string doesn't resolve to a primitive (string, number, boolean or null).`,
        {
          string,
          resolved,
        }
      )
    }

    return <Primitive | undefined>resolved
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
export async function resolveTemplateStrings<T extends object>(
  obj: T,
  context: ConfigContext,
  opts: ContextResolveOpts = {}
): Promise<T> {
  return asyncDeepMap(
    obj,
    (v) => (typeof v === "string" ? resolveTemplateString(v, context, opts) : v),
    // need to iterate sequentially to catch potential circular dependencies
    { concurrency: 1 }
  )
}

/**
 * Scans for all template strings in the given object and lists the referenced keys.
 */
export async function collectTemplateReferences<T extends object>(obj: T): Promise<string[][]> {
  const context = new ScanContext()
  await resolveTemplateStrings(obj, context)
  return uniq(context.foundKeys.entries()).sort()
}

export async function getRuntimeTemplateReferences<T extends object>(obj: T) {
  const refs = await collectTemplateReferences(obj)
  return refs.filter((ref) => ref[0] === "runtime")
}

async function buildBinaryExpression(head: any, tail: any) {
  return Bluebird.reduce(
    tail,
    async (result: any, element: any) => {
      const operator = element[1]

      return Promise.all([result, element[3]])
        .then(([leftRes, rightRes]) => {
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
        })
        .catch((_error) => {
          return { _error }
        })
    },
    head
  )
}

async function buildLogicalExpression(head: any, tail: any) {
  return Bluebird.reduce(
    tail,
    async (result: any, element: any) => {
      const operator = element[1]

      return Promise.all([result, element[3]])
        .then(([leftRes, rightRes]) => {
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
        })
        .catch((_error) => {
          return { _error }
        })
    },
    head
  )
}
