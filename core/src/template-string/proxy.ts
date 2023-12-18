/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js"
import type { Collection, CollectionOrValue } from "../util/objects.js"
import { isArray, isPlainObject } from "../util/objects.js"
import type { TemplatePrimitive, TemplateValue } from "./inputs.js"
import { isTemplateLeaf, isTemplateValue } from "./inputs.js"
import { evaluate } from "./lazy.js"
import { InternalError } from "../exceptions.js"

export const getCollectionSymbol = Symbol("GetCollection")

type LazyConfigProxyParams = {
  parsedConfig: CollectionOrValue<TemplateValue>
  context: ConfigContext
  opts: ContextResolveOpts
}
export function getLazyConfigProxy({
  parsedConfig,
  context,
  opts,
}: LazyConfigProxyParams): CollectionOrValue<TemplatePrimitive> {
  const collection = evaluate({ value: parsedConfig, context, opts })

  if (isTemplateLeaf(collection)) {
    return collection.value
  }

  const proxy = new Proxy(collection, {
    get(_, prop) {
      if (prop === getCollectionSymbol) {
        return collection
      }

      const value = collection[prop]

      if (!isTemplateValue(value) && !isArray(value) && !isPlainObject(value)) {
        return value
      }

      if (typeof prop === "symbol") {
        return value
      }

      const evaluated = evaluate({ value, context, opts })

      if (isTemplateLeaf(evaluated)) {
        return evaluated.value
      }

      return getLazyConfigProxy({ parsedConfig: evaluated, context, opts })
    },
    ownKeys() {
      return Object.getOwnPropertyNames(collection)
    },
    has(_, key) {
      return key in collection || Object.hasOwn(collection, key)
    },
    getOwnPropertyDescriptor(_, key) {
      return Object.getOwnPropertyDescriptor(collection, key)
    },
    set(_, key, value) {
      throw new InternalError({
        message: `getLazyConfigProxy: Attempted to set key ${String(key)} to value ${JSON.stringify(
          value
        )} on lazy config proxy`,
      })
    },
  }) as Collection<TemplatePrimitive>

  // TODO
  // // This helps when looking at proxy instances in the debugger.
  // // The debugger lists symbol properties and that enables you to dig into the backing AST, if you want.
  // proxy[Symbol.for("BackingCollection")] = parsedConfig

  return proxy
}
