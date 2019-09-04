/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import lodash = require("lodash")
import Bluebird = require("bluebird")
import { asyncDeepMap } from "./util/util"
import { GardenBaseError, ConfigurationError } from "./exceptions"
import { ConfigContext, ContextResolveOpts, ScanContext } from "./config/config-context"
import { uniq } from "lodash"
import { Primitive } from "./config/common"
import { isNumber } from "util"

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
  const parser = await getParser()
  try {
    const parsed = parser.parse(string, {
      getKey: async (key: string[], resolveOpts?: ContextResolveOpts) => {
        return context.resolve({ key, nodePath: [], opts: { ...opts, ...(resolveOpts || {}) } })
      },
      // Some utilities to pass to the parser
      buildBinaryExpression,
      buildLogicalExpression,
      lodash,
      ConfigurationError,
      TemplateStringError,
      allowUndefined: opts.allowUndefined,
    })

    const resolved: (Primitive | undefined | { _error: Error })[] = await Bluebird.all(parsed)

    // We need to manually propagate errors in the parser, so we catch them here
    for (const r of resolved) {
      if (r && r["_error"]) {
        throw r["_error"]
      }
    }

    const result =
      resolved.length === 1
        ? // Return value directly if there is only one value in the output
          resolved[0]
        : // Else join together all the parts as a string. Output null as a literal string and not an empty string.
          resolved.map((v) => (v === null ? "null" : v)).join("")

    return <Primitive | undefined>result
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
        .then(([left, right]) => {
          // We need to manually handle and propagate errors because the parser doesn't support promises
          if (left && left._error) {
            return left
          }
          if (right && right._error) {
            return right
          }

          // Disallow undefined values for comparisons
          if (left === undefined || right === undefined) {
            const err = new TemplateStringError(`Could not resolve one or more keys.`, { left, right, operator })
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
        .then(([left, right]) => {
          // We need to manually handle and propagate errors because the parser doesn't support promises
          if (left && left._error) {
            return left
          }
          if (right && right._error) {
            return right
          }

          switch (operator) {
            case "&&":
              return left && right
            case "||":
              return left || right
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
