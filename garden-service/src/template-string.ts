/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import { asyncDeepMap } from "./util/util"
import { GardenBaseError } from "./exceptions"
import { ConfigContext, ContextResolveOpts } from "./config/config-context"

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
export async function resolveTemplateString(string: string, context: ConfigContext, opts: ContextResolveOpts = {}) {
  const parser = await getParser()
  const parsed = parser.parse(string, {
    getKey: async (key: string[], resolveOpts?: ContextResolveOpts) => {
      return context.resolve({ key, nodePath: [], opts: { ...opts, ...resolveOpts || {} } })
    },
    // need this to allow nested template strings
    resolve: async (parts: StringOrStringPromise[], resolveOpts?: ContextResolveOpts) => {
      const s = (await Bluebird.all(parts)).join("")
      return resolveTemplateString(`\$\{${s}\}`, context, { ...opts, ...resolveOpts || {} })
    },
    TemplateStringError,
  })

  const resolved = await Bluebird.all(parsed)
  return resolved.join("")
}

/**
 * Recursively parses and resolves all templated strings in the given object.
 */
export async function resolveTemplateStrings<T extends object>(
  obj: T, context: ConfigContext, opts: ContextResolveOpts = {},
): Promise<T> {
  return asyncDeepMap(
    obj,
    (v) => typeof v === "string" ? resolveTemplateString(v, context, opts) : v,
    // need to iterate sequentially to catch potential circular dependencies
    { concurrency: 1 },
  )
}
