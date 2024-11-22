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

export function createVariableScope(...variableSources: DeepPrimitiveMap[]): DeepPrimitiveMap {
  const proxy = new Proxy({} as DeepPrimitiveMap, {
    get: (_target, key: string | symbol, _receiver: any) => {
      if (typeof key === "symbol") {
        return undefined
      }

      for (const variableSource of variableSources) {
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
      return uniq(variableSources.flatMap(Object.keys))
    },

    getOwnPropertyDescriptor(_target, key) {
      return { enumerable: true, configurable: true, value: proxy[key] }
    },
  })
  return proxy
}
