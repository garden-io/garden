/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenErrorParams } from "../exceptions.js"
import { InternalError, NotImplementedError } from "../exceptions.js"
import type { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js"
import type { Primitive } from "../config/common.js"
import { isPrimitive } from "../config/common.js"
import type { CollectionOrValue } from "../util/objects.js"
import { deepMap } from "../util/objects.js"
import type { ConfigSource } from "../config/validation.js"
import * as parser from "./parser.js"
import type { EvaluateTemplateArgs, ResolvedTemplate } from "./types.js"
import { UnresolvedTemplateValue, type TemplatePrimitive } from "./types.js"
import * as ast from "./ast.js"
import { LRUCache } from "lru-cache"
import type { TemplateExpressionGenerator } from "./analysis.js"
import { TemplateStringError } from "./errors.js"

const escapePrefix = "$${"

type ParseParams = Parameters<typeof parser.parse>

function parseWithPegJs(params: ParseParams) {
  return parser.parse(...params)
}

const shouldUnescape = (ctxOpts: ContextResolveOpts) => {
  // Explicit non-escaping takes the highest priority.
  if (ctxOpts.unescape === false) {
    return false
  }

  return !!ctxOpts.unescape
}

const parseTemplateStringCache = new LRUCache<string, string | ast.TemplateExpression>({
  max: 100000,
})

class ParsedTemplateString extends UnresolvedTemplateValue {
  constructor(
    private readonly source: ConfigSource,
    private readonly rootNode: ast.TemplateExpression
  ) {
    super()
  }

  override evaluate(args: EvaluateTemplateArgs): ResolvedTemplate {
    const res = this.rootNode.evaluate({ ...args, yamlSource: this.source })
    if (typeof res === "symbol") {
      throw new InternalError({
        message:
          "ParsedTemplateString: template expression evaluated to symbol. ContextLookupExpression should have thrown.",
      })
    }
    return res
  }

  public override toJSON(): string {
    return this.rootNode.rawText
  }

  public override *visitAll(): TemplateExpressionGenerator {
    yield* this.rootNode.visitAll(this.source)
  }
}

export function parseTemplateString({
  rawTemplateString,
  // TODO: remove unescape hacks.
  unescape = false,
  source,
}: {
  rawTemplateString: string
  unescape?: boolean
  source: ConfigSource
}): ParsedTemplateString | string {
  // Just return immediately if this is definitely not a template string
  if (!maybeTemplateString(rawTemplateString)) {
    return rawTemplateString
  }

  const key = `u-${unescape ? "1" : "0"}-${rawTemplateString}`
  const cached = parseTemplateStringCache.get(key)

  if (cached instanceof ast.TemplateExpression) {
    return new ParsedTemplateString(source, cached)
  } else if (cached) {
    return cached
  }

  const templateStringSource: ast.TemplateStringSource = {
    rawTemplateString,
  }

  class ParserError extends TemplateStringError {
    constructor(params: GardenErrorParams & { loc: ast.Location }) {
      super({
        ...params,
        yamlSource: source,
      })
    }
  }

  const parsed: ast.TemplateExpression = parseWithPegJs([
    rawTemplateString,
    {
      ast,
      escapePrefix,
      optionalSuffix: "}?",
      parseNested: (nested: string) => parseTemplateString({ rawTemplateString: nested, unescape, source }),
      TemplateStringError: ParserError,
      unescape,
      grammarSource: templateStringSource,
    },
  ])

  parseTemplateStringCache.set(key, parsed)

  return new ParsedTemplateString(source, parsed)
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
  source,
}: {
  string: string
  context: ConfigContext
  contextOpts?: ContextResolveOpts
  source?: ConfigSource
}): CollectionOrValue<TemplatePrimitive> {
  if (source === undefined) {
    source = {
      path: [],
      yamlDoc: undefined,
    }
  }

  const parsed = parseTemplateString({
    rawTemplateString: string,
    // TODO: remove unescape hacks.
    unescape: shouldUnescape(contextOpts),
    source,
  })

  // string does not contain
  if (typeof parsed === "string") {
    return parsed
  }

  const result = parsed.evaluate({
    context,
    opts: contextOpts,
  })

  if (typeof result !== "symbol") {
    return result
  }

  throw new InternalError({
    message: `template expression returned symbol ${String(result)}. ast.ContextLookupExpression should have thrown an error.`,
  })

  // Requested partial evaluation and the template expression cannot be evaluated yet. We may be able to do it later.

  // TODO: Parse all template expressions after reading the YAML config and only re-evaluate ast.TemplateExpression instances in
  // resolveTemplateStrings; Otherwise we'll inevitably have a bug where garden will resolve template expressions that might be
  // contained in expression evaluation results e.g. if an environment variable contains template string, we don't want to
  // evaluate the template string in there.
  // See also https://github.com/garden-io/garden/issues/5825
}

/**
 * Recursively parses and resolves all templated strings in the given object.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export function resolveTemplateStrings<T>(_args: {
  value: T
  context: ConfigContext
  contextOpts?: ContextResolveOpts
  source: ConfigSource | undefined
}): T {
  throw new NotImplementedError({ message: "TODO" })
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

  // TODO: use visitAll instead.
  deepMap(obj, (v) => {
    if (maybeTemplateString(v)) {
      out = true
    }
  })

  return out
}
