/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isEmpty } from "lodash"
import { PrimitiveMap } from "../config/common"
import { serializeObject } from "../util/serialization"

export interface GardenInstanceKeyParams {
  environmentName: string
  namespace?: string
  projectRoot: string
  variableOverrides: PrimitiveMap
}

export function getGardenInstanceKey(params: GardenInstanceKeyParams): string {
  let env = params.environmentName

  if (params.namespace) {
    env += "-" + params.namespace
  }

  const pairs: any = { env }

  // Hash any variable overrides
  if (!isEmpty(params.variableOverrides)) {
    pairs.var = serializeObject(params.variableOverrides).slice(0, 8)
  }

  return Object.entries(pairs)
    .map(([k, v]) => k + "=" + v)
    .join("|")
}
