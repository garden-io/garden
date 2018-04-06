/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import Bluebird = require("bluebird")
import { isPrimitive, Primitive } from "./types/common"
import { deepResolve } from "./util"
import * as deepMap from "deep-map"
import { GardenError } from "./exceptions"

export type StringOrStringPromise = Promise<string> | string
export type KeyResolver = (keyParts: string[]) => StringOrStringPromise

export interface TemplateStringContext {
  [type: string]: Primitive | KeyResolver | TemplateStringContext | undefined
}

class TemplateStringError extends GardenError {
  type = "template-string"
}

let _parser: any

function getParser() {
  if (!_parser) {
    try {
      _parser = require("./template-string-parser")
    } catch (_err) {
      // fallback for when running with ts-node or mocha
      const peg = require("pegjs")
      const pegFilePath = resolve(__dirname, "template-string.pegjs")
      const grammar = readFileSync(pegFilePath)
      _parser = peg.generate(grammar.toString(), { trace: false })
    }
  }

  return _parser
}

export interface TemplateOpts {
  ignoreMissingKeys?: boolean
}

/**
 * Parse and resolve a templated string, with the given context. The template format is similar to native JS templated
 * strings but only supports simple lookups from the given context, e.g. "prefix-${nested.key}-suffix", and not
 * arbitrary JS code.
 *
 * The context should be a map whose values are either primitives (string, number or boolean), resolver functions
 * or a nested context maps.
 *
 * Resolver functions should accept a key path as an array of strings and return a string or string Promise.
 */
export async function resolveTemplateString(
  string: string, context: TemplateStringContext, { ignoreMissingKeys = false }: TemplateOpts = {},
) {
  const parser = getParser()
  const parsed = parser.parse(string, {
    getKey: genericResolver(context, ignoreMissingKeys),
    // need this to allow nested template strings
    resolve: async (parts: StringOrStringPromise[]) => {
      const s = (await Bluebird.all(parts)).join("")
      return resolveTemplateString(`\$\{${s}\}`, context, { ignoreMissingKeys })
    },
    TemplateStringError,
  })

  const resolved = await Bluebird.all(parsed)
  return resolved.join("")
}

export function genericResolver(context: TemplateStringContext, ignoreMissingKeys = false): KeyResolver {
  return (parts: string[]) => {
    const path = parts.join(".")
    let value

    for (let p = 0; p < parts.length; p++) {
      const part = parts[p]
      value = value ? value[part] : context[part]

      switch (typeof value) {
        case "function":
          // pass the rest of the key parts to the resolver function
          return value(parts.slice(p + 1))

        case "undefined":
          if (ignoreMissingKeys) {
            // return the format string unchanged if option is set
            return `\$\{${path}\}`
          } else {
            throw new TemplateStringError(`Could not find key: ${path}`, { path, context })
          }
      }
    }

    if (!isPrimitive(value)) {
      throw new TemplateStringError(`Value at ${path} exists but is not a primitive (string, number or boolean)`, {
        value,
        path,
        context,
      })
    }

    return value
  }
}

/**
 * Recursively parses and resolves all templated strings in the given object.
 */
export async function resolveTemplateStrings<T extends object>(
  o: T, context: TemplateStringContext, opts?: TemplateOpts,
): Promise<T> {
  const mapped = deepMap(o, (v) => typeof v === "string" ? resolveTemplateString(v, context, opts) : v)
  return deepResolve(mapped)
}

export async function getTemplateContext(extraContext: TemplateStringContext = {}): Promise<TemplateStringContext> {
  const baseContext: TemplateStringContext = {
    // TODO: add user configuration here
    local: {
      env: process.env,
    },
  }

  return { ...baseContext, ...extraContext }
}
