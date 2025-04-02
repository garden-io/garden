/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deepMap, isArray, type CollectionOrValue } from "../util/objects.js"
import { evaluate } from "./evaluate.js"
import type { EvaluateTemplateArgs, ParsedTemplate, TemplateEvaluationResult, TemplatePrimitive } from "./types.js"
import { isTemplatePrimitive, UnresolvedTemplateValue } from "./types.js"

// https://datatracker.ietf.org/doc/html/rfc7396
export class LazyMergePatch extends UnresolvedTemplateValue {
  constructor(private readonly items: ParsedTemplate[]) {
    super()
  }

  public override evaluate(args: EvaluateTemplateArgs): TemplateEvaluationResult {
    const toBeMerged: Record<string, ParsedTemplate>[] = []

    for (const item of this.items.toReversed()) {
      const { resolved } = evaluate(item, args)

      if (isTemplatePrimitive(resolved)) {
        if (resolved === null && item !== this.items[0]) {
          return {
            partial: false,
            resolved: undefined, // null values are supposed to remove the key
          }
        }
        return {
          partial: false,
          resolved,
        }
      }
      if (isArray(resolved)) {
        return {
          partial: true,
          resolved,
        }
      }

      toBeMerged.push(resolved)
    }

    // in-place reverse toBeMerged; We traverse items in reverse above, so we can return early
    // the items we pass onto `new LazyMergePatch` need to be in the original order
    toBeMerged.reverse()

    const keys = new Set<string>()
    for (const value of toBeMerged) {
      for (const k of Object.keys(value)) {
        keys.add(k)
      }
    }

    const returnValue: Record<string, ParsedTemplate> = {}

    for (const k of keys) {
      const items = toBeMerged.filter((o) => k in o).map((o) => o[k])
      returnValue[k] = new LazyMergePatch(items)
    }

    return {
      partial: true,
      resolved: returnValue,
    }
  }

  public override toJSON(): CollectionOrValue<TemplatePrimitive> {
    return deepMap(this.items, (v) => (v instanceof UnresolvedTemplateValue ? v.toJSON() : v))
  }

  public override getChildren(): ParsedTemplate[] {
    return this.items
  }
}
