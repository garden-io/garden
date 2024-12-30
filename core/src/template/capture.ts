/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContextResolveOutput, ContextResolveParams } from "../config/template-contexts/base.js"
import { ConfigContext } from "../config/template-contexts/base.js"
import { NotImplementedError } from "../exceptions.js"
import { deepMap } from "../util/objects.js"
import type { TemplateExpressionGenerator } from "./analysis.js"
import type { EvaluateTemplateArgs, ParsedTemplate, ResolvedTemplate } from "./types.js"
import { UnresolvedTemplateValue } from "./types.js"

export function capture<T extends ParsedTemplate>(template: T, context: ConfigContext): T {
  return deepMap(template, (v) => {
    if (v instanceof UnresolvedTemplateValue) {
      return new CapturedContextTemplateValue(v, context)
    }
    return v
  }) as T
}

export class LayeredContext extends ConfigContext {
  readonly #contexts: ConfigContext[]
  constructor(...contexts: ConfigContext[]) {
    super()
    this.#contexts = contexts
  }
  override resolve(_args: ContextResolveParams): ContextResolveOutput {
    throw new NotImplementedError({ message: "TODO" })
  }
}

export class CapturedContextTemplateValue extends UnresolvedTemplateValue {
  readonly #wrapped: UnresolvedTemplateValue
  readonly #context: ConfigContext

  constructor(wrapped: UnresolvedTemplateValue, context: ConfigContext) {
    super()
    this.#wrapped = wrapped
    this.#context = context
  }

  override evaluate(args: EvaluateTemplateArgs): ResolvedTemplate {
    const context = new LayeredContext(this.#context, args.context)

    return this.#wrapped.evaluate({ ...args, context })
  }

  override toJSON(): ResolvedTemplate {
    return this.#wrapped.toJSON()
  }

  override *visitAll(): TemplateExpressionGenerator {
    yield* this.#wrapped.visitAll()
  }
}
