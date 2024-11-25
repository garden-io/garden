/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeepPrimitiveMap } from "../common.js"
import { InternalError } from "../../exceptions.js"
import { uniq } from "lodash-es"
import { Memoize } from "typescript-memoize"

/**
 * Creates a proxy object that emulates the merging of the given variables.
 *
 * It takes the given variable scopes and does lookup operations in the order of the scope appearance,
 * instead of merging the given variable scopes physically.
 *
 * The first scope in the input variable scopes takes the highest precedence.
 *
 * @param variableScopes the input variable scopes
 */
export function createVariableScope(...variableScopes: DeepPrimitiveMap[]): DeepPrimitiveMap {
  let computedOwnKeys: readonly string[] | undefined
  const proxy = new Proxy({} as DeepPrimitiveMap, {
    get: (_target, key: string | symbol, _receiver: any) => {
      if (typeof key === "symbol") {
        return undefined
      }

      for (const variableSource of variableScopes) {
        if (key in variableSource) {
          return variableSource[key]
        }
      }

      return undefined
    },

    set: () => {
      throw new InternalError({ message: "Variable scope cannot be mutated!" })
    },

    ownKeys() {
      if (!computedOwnKeys) {
        computedOwnKeys = uniq(variableScopes.flatMap(Object.keys))
      }
      return computedOwnKeys
    },

    getOwnPropertyDescriptor(_target, key) {
      return { enumerable: true, configurable: true, value: proxy[key] }
    },
  })
  return proxy
}
