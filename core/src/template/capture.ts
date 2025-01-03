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
import { deepEvaluate } from "./evaluate.js"
import type { EvaluateTemplateArgs, ParsedTemplate, ResolvedTemplate } from "./types.js"
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

  override evaluate(args: EvaluateTemplateArgs): ResolvedTemplate {
    const context = new LayeredContext(this.context, args.context)

    return deepEvaluate(this.wrapped, { ...args, context })
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
