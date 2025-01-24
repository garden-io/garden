/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenErrorParams } from "../exceptions.js"
import { InternalError } from "../exceptions.js"
import type { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js"
import type { CollectionOrValue } from "../util/objects.js"
import type { ConfigSource } from "../config/validation.js"
import * as parser from "./parser.js"
import type { EvaluateTemplateArgs, ParsedTemplate, ResolvedTemplate } from "./types.js"
import { UnresolvedTemplateValue, type TemplatePrimitive } from "./types.js"
import * as ast from "./ast.js"
import { LRUCache } from "lru-cache"
import { visitAll, type TemplateExpressionGenerator } from "./analysis.js"
import { TemplateStringError } from "./errors.js"

const escapePrefix = "$${"

type ParseParams = Parameters<typeof parser.parse>

function parseWithPegJs(params: ParseParams) {
  return parser.parse(...params)
}

const shouldUnescape = ({ unescape = true }: ContextResolveOpts) => {
  return unescape
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

  override evaluate(args: EvaluateTemplateArgs): {
    partial: false
    resolved: ResolvedTemplate
  } {
    const res = this.rootNode.evaluate({ ...args, yamlSource: this.source })
    if (typeof res === "symbol") {
      throw new InternalError({
        message:
          "ParsedTemplateString: template expression evaluated to symbol. ContextLookupExpression should have thrown.",
      })
    }
    return {
      partial: false,
      resolved: res,
    }
  }

  public override toJSON(): string {
    return this.rootNode.rawText
  }

  override toString(): string {
    return `UnresolvedTemplateValue(${this.rootNode.rawText})`
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
  if (!rawTemplateString.includes("${")) {
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
      parseNested: (nested: string) => {
        const p = parseTemplateString({ rawTemplateString: nested, unescape, source })
        if (p instanceof UnresolvedTemplateValue) {
          return p["rootNode"]
        } else {
          return p
        }
      },
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

  if (typeof parsed === "string") {
    return parsed
  }

  const { resolved } = parsed.evaluate({
    context,
    opts: contextOpts,
  })

  return resolved
}

/**
 * Returns `true` if the given value may be or contain instances of `UnresolvedTemplateValue`.
 */
export function isUnresolved(value: ParsedTemplate) {
  const generator = visitAll({ value })
  for (const _ of generator) {
    return true
  }
  return false
}
