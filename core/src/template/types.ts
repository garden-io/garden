/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Primitive } from "utility-types"
import { isPrimitive } from "utility-types"
import type { CollectionOrValue } from "../util/objects.js"
import type { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js"
import type { TemplateExpressionGenerator } from "./analysis.js"

export function isTemplatePrimitive(value: unknown): value is TemplatePrimitive {
  return isPrimitive(value) && typeof value !== "symbol"
}

/**
 * Primitive types that can be used in the template language.
 *
 * Symbols have special meanings in the template language implementation and are reserved as an indicator for
 * failures to look up variables in the context. See @type TemplateEvaluationResult
 */
export type TemplatePrimitive = Exclude<Primitive, symbol>

/**
 * Parsed template values are either:
 * - primitives, if the key path did not contain template strings or structural operations
 * - an instance of `UnresolvedTemplateValue`, if the key path contained template strings or structural operations
 */
export type ParsedTemplateValue = TemplatePrimitive | UnresolvedTemplateValue

/**
 * Resolved template values are just primitives, strings, numbers, booleans etc.
 */
export type ResolvedTemplateValue = TemplatePrimitive

/**
 * Parsed templates are either:
 * - a parsed template value (See @type ParsedTemplateValue)
 * - a Record of parsed templates
 * - an array of parsed templates
 */
export type ParsedTemplate = CollectionOrValue<ParsedTemplateValue>

/**
 * Resolved templates are either:
 * - primitives (See @type TemplatePrimitive)
 * - a record of resolved templates
 * - an array of resolved templates
 */
export type ResolvedTemplate = CollectionOrValue<ResolvedTemplateValue>

export type EvaluateTemplateArgs = {
  readonly context: ConfigContext
  readonly opts: Readonly<ContextResolveOpts>
}

export abstract class UnresolvedTemplateValue {
  public abstract evaluate(args: EvaluateTemplateArgs): ResolvedTemplate
  public abstract toJSON(): ResolvedTemplate

  public abstract visitAll(): TemplateExpressionGenerator
}
