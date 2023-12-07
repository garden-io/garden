/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { memoize } from "lodash-es"
import { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js"
import { Collection, CollectionOrValue, isArray, isPlainObject } from "../util/objects.js"
import { TemplatePrimitive, TemplateValue, isTemplateLeaf, isTemplateLeafValue, isTemplateValue } from "./inputs.js"
import { unwrap, unwrapLazyValues } from "./lazy.js"
import { InternalError } from "../exceptions.js"

type DeepUnwrapProxyParams = { parsedConfig: CollectionOrValue<TemplateValue>, expectedCollectionType?: "object" | "array", context: ConfigContext, opts: ContextResolveOpts }
export function getDeepUnwrapProxy({ parsedConfig, expectedCollectionType = "object", context, opts }: DeepUnwrapProxyParams): Collection<TemplatePrimitive> {
  const getCollection = memoize(() => {
    const collection = unwrapLazyValues({ value: parsedConfig, context, opts });

    if (isTemplateLeaf(collection)) {
      throw new InternalError({
        message: "Expected a collection, got a leaf value",
      })
    }

    if (expectedCollectionType === "object" && !isPlainObject(collection)) {
      throw new InternalError({
        message: `Expected an object, got array`,
      })
    }

    if (expectedCollectionType === "array" && !isArray(collection)) {
      throw new InternalError({
        message: `Expected an array, got object`,
      })
    }

    return collection satisfies Collection<TemplateValue>
  })

  const proxy = new Proxy(expectedCollectionType === "array" ? [] : {}, {
    get(_, prop) {
      const collection = getCollection()
      const value = collection[prop];

      if (isArray(collection)) {
        // makes iterators work
        if (typeof prop === "symbol") {
          return value
        }
      }

      if (!isTemplateValue(value) && !isArray(value) && !isPlainObject(value)) {
        return value
      }

      const evaluated = unwrap({ value, context, opts })

      if (isTemplateLeafValue(evaluated)) {
        return evaluated
      }

      if (isArray(evaluated)) {
        return getDeepUnwrapProxy({ parsedConfig: evaluated satisfies Collection<TemplateValue>, expectedCollectionType: "array", context, opts })
      }

      return getDeepUnwrapProxy({ parsedConfig: evaluated, context, opts });
    },
    ownKeys() {
      return Object.keys(getCollection())
    },
    has(_, key) {
      return key in getCollection() || Object.hasOwn(getCollection(), key)
    },
    getOwnPropertyDescriptor(_, key) {
      return Object.getOwnPropertyDescriptor(getCollection(), key)
    },
  }) as Collection<TemplatePrimitive>

  // // This helps when looking at proxy instances in the debugger.
  // // The debugger lists symbol properties and that enables you to dig into the backing AST, if you want.
  // proxy[Symbol.for("BackingCollection")] = parsedConfig

  return proxy
}
