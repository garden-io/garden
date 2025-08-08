/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js"
import { LayeredContext } from "../config/template-contexts/base.js"
import type { Collection } from "../util/objects.js"
import { deepMap } from "../util/objects.js"
import type { VisitorOpts } from "./analysis.js"
import { evaluate } from "./evaluate.js"
import type {
  EvaluateTemplateArgs,
  ParsedTemplate,
  ResolvedTemplate,
  TemplateEvaluationResult,
  TemplatePrimitive,
} from "./types.js"
import { isTemplatePrimitive, UnresolvedTemplateValue } from "./types.js"

type CaptureResult<Input extends ParsedTemplate> = Input extends TemplatePrimitive
  ? Input
  : CapturedContextTemplateValue

export function capture<Input extends ParsedTemplate>(
  template: Input,
  context: ConfigContext,
  opts: Partial<ContextResolveOpts> = {}
): CaptureResult<Input> {
  if (isTemplatePrimitive(template)) {
    return template as CaptureResult<Input>
  }
  return new CapturedContextTemplateValue(template, context, opts) as CaptureResult<Input>
}

export class CapturedContextTemplateValue extends UnresolvedTemplateValue {
  constructor(
    readonly wrapped: ParsedTemplate,
    private readonly context: ConfigContext,
    private readonly opts: ContextResolveOpts
  ) {
    super()
    this.context = context
  }

  override evaluate(args: EvaluateTemplateArgs): TemplateEvaluationResult {
    const context = new LayeredContext(`captured ${this.context.toSanitizedValue()}`, args.context, this.context)

    const result = evaluate(this.wrapped, {
      ...args,
      context,
      opts: {
        ...args.opts,
        ...this.opts,
      },
    })

    if (!result.partial) {
      return result
    }

    return {
      partial: true,
      resolved: deepMap(result.resolved, (v) => capture(v, this.context, this.opts)) as Collection<ParsedTemplate>,
    }
  }

  override toJSON(): ResolvedTemplate {
    return deepMap(this.wrapped, (v) => {
      if (v instanceof UnresolvedTemplateValue) {
        return v.toJSON()
      }
      return v
    })
  }

  override getChildren(opts: VisitorOpts): ParsedTemplate[] {
    if (opts.onlyEssential && !(this.wrapped instanceof UnresolvedTemplateValue)) {
      // if wrapped is UnresolvedTemplateValue, it's essential - if it is a collection, it's not
      return []
    }

    return [this.wrapped]
  }
}
