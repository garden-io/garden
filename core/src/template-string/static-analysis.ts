/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isNumber, isString } from "lodash-es"
import { CollectionOrValue, isArray, isPlainObject } from "../util/objects.js"
import { ContextLookupExpression, IdentifierExpression, LiteralExpression, MemberExpression, TemplateExpression } from "./ast.js"
import { TemplateValue } from "./inputs.js"
import { LazyValue } from "./lazy.js"
import { ObjectPath } from "../config/template-contexts/base.js"


export type Visitor = (value: (TemplateValue | TemplateExpression)) => boolean

export function visitAll(
  value: CollectionOrValue<TemplateValue>,
  visitor: Visitor
): boolean {
  if (isArray(value)) {
    for (const [k, v] of value.entries()) {
      if (!visitAll(v, visitor)) {
        return false
      }
    }
  } else if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      if (!visitAll(value[k], visitor)) {
        return false
      }
    }
  } else {
    if (!visitor(value)) {
      return false
    }

    if (value instanceof LazyValue) {
      if (!value.visitAll(visitor)) {
        return false
      }
    }
  }

  return true
}

export function getContextLookupReferences(
  value: CollectionOrValue<TemplateValue>
): ObjectPath[] {
  const refs: ObjectPath[] = []

  visitAll(value, (expression) => {
    if (expression instanceof ContextLookupExpression) {
      const keyPath: (string|number)[] = []

      for (const v of expression.keyPath.values()) {
        if (v instanceof IdentifierExpression) {
          keyPath.push(v.name)
        } else if (v instanceof MemberExpression) {
          if (v.innerExpression instanceof LiteralExpression) {
            if (isString(v.innerExpression.literal) || isNumber(v.innerExpression.literal)) {
              keyPath.push(v.innerExpression.literal)
            } else {
              // only strings and numbers are valid here
              break
            }
          } else {
            // it's a dynamic key, so we can't know the value
            break
          }
        } else {
          v satisfies never
        }
      }

      if (keyPath.length > 0) {
        refs.push(keyPath)
      }
    }

    return true
  })

  return refs
}
