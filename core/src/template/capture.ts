/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ConfigContext } from "../config/template-contexts/base.js"
import { LayeredContext } from "../config/template-contexts/base.js"
import { deepMap } from "../util/objects.js"
import { visitAll, type TemplateExpressionGenerator } from "./analysis.js"
import { evaluate } from "./evaluate.js"
import type { EvaluateTemplateArgs, ParsedTemplate, ResolvedTemplate, TemplateEvaluationResult } from "./types.js"
import { isTemplatePrimitive, UnresolvedTemplateValue } from "./types.js"

export function capture(template: ParsedTemplate, context: ConfigContext): ParsedTemplate {
  if (isTemplatePrimitive(template)) {
    return template
  }
  return new CapturedContextTemplateValue(template, context)
}

export class CapturedContextTemplateValue extends UnresolvedTemplateValue {
  constructor(
    private readonly wrapped: ParsedTemplate,
    private readonly context: ConfigContext
  ) {
    super()
    this.context = context
  }

  override evaluate(args: EvaluateTemplateArgs): TemplateEvaluationResult {
    const context = new LayeredContext(this.context, args.context)

    const { resolved, partial } = evaluate(this.wrapped, { ...args, context })

    if (partial) {
      return {
        partial: true,
        resolved: deepMap(resolved, (v) => capture(v, context)),
      }
    }

    return {
      partial: false,
      resolved,
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

  override *visitAll(): TemplateExpressionGenerator {
    yield* visitAll({ value: this.wrapped })
  }
}
