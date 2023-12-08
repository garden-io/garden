/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { memoize } from "lodash-es"
import type { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js"
import type { Collection, CollectionOrValue } from "../util/objects.js"
import { isArray, isPlainObject } from "../util/objects.js"
import type { TemplatePrimitive, TemplateValue } from "./inputs.js"
import {
  TemplateLeaf,
  isTemplateLeaf,
  isTemplatePrimitive,
  isTemplateValue,
  templatePrimitiveDeepMap,
} from "./inputs.js"
import { evaluate, MutableOverlayLazyValue } from "./lazy.js"
import { InternalError } from "../exceptions.js"

export const getCollectionSymbol = Symbol("GetCollection")

type LazyConfigProxyParams = {
  parsedConfig: CollectionOrValue<TemplateValue>
  expectedCollectionType?: "object" | "array"
  context: ConfigContext
  opts: ContextResolveOpts
  currentPath?: (string | number)[]
}
export function getLazyConfigProxy({
  parsedConfig,
  expectedCollectionType = "object",
  context,
  opts,
  currentPath = [],
}: LazyConfigProxyParams): Collection<TemplatePrimitive> {
  const getOverlay = memoize(() => {
    if (parsedConfig instanceof MutableOverlayLazyValue) {
      return parsedConfig
    }

    const collection = evaluate({ value: parsedConfig, context, opts })

    if (isTemplateLeaf(collection)) {
      throw new InternalError({
        message: "getLazyConfigProxy: Expected a collection, got a leaf value",
      })
    }

    if (expectedCollectionType === "object" && !isPlainObject(collection)) {
      throw new InternalError({
        message: `getLazyConfigProxy: Expected an object, got array`,
      })
    }

    if (expectedCollectionType === "array" && !isArray(collection)) {
      throw new InternalError({
        message: `getLazyConfigProxy: Expected an array, got object`,
      })
    }

    return new MutableOverlayLazyValue({ source: undefined, yamlPath: [] }, collection)
  })

  const getCollection = () => {
    const overlay = getOverlay()

    let currentValue = evaluate({ value: overlay, context, opts })

    for (const key of currentPath) {
      currentValue = evaluate({ value: currentValue, context, opts })[key]
    }

    return evaluate({ value: currentValue, context, opts })
  }

  const proxy = new Proxy(expectedCollectionType === "array" ? [] : {}, {
    get(_, prop) {
      if (prop === getCollectionSymbol) {
        return getCollection()
      }

      const collection = getCollection()

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

      if (isArray(evaluated)) {
        return getLazyConfigProxy({
          parsedConfig: getOverlay(),
          expectedCollectionType: "array",
          context,
          opts,
          currentPath: [...currentPath, prop],
        })
      }

      return getLazyConfigProxy({ parsedConfig: getOverlay(), context, opts, currentPath: [...currentPath, prop] })
    },
    ownKeys() {
      return Object.keys(getCollection())
    },
    has(_, key) {
      return key in getCollection() || Object.hasOwn(getCollection(), key)
    },
    set(_, key, value) {
      if (typeof key === "symbol") {
        throw new InternalError({
          message: `getLazyConfigProxy: Attempted to set a symbol key`,
        })
      }

      const wrapped = templatePrimitiveDeepMap(value, (v) => {
        if (!isTemplatePrimitive(v)) {
          throw new InternalError({
            message: `getLazyConfigProxy: Attempted to set non-template value`,
          })
        }

        return new TemplateLeaf({ value, expr: undefined, inputs: {} })
      })

      const overlay = getOverlay()
      overlay.overrideKeyPath([...currentPath, key], wrapped)

      return true
    },
    getOwnPropertyDescriptor(_, key) {
      return Object.getOwnPropertyDescriptor(getCollection(), key)
    },
  }) as Collection<TemplatePrimitive>

  // TODO
  // // This helps when looking at proxy instances in the debugger.
  // // The debugger lists symbol properties and that enables you to dig into the backing AST, if you want.
  // proxy[Symbol.for("BackingCollection")] = parsedConfig

  return proxy
}
