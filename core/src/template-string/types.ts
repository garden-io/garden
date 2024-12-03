/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Primitive } from "utility-types"
import { isPrimitive } from "utility-types"

export function isTemplatePrimitive(value: unknown): value is TemplatePrimitive {
  return isPrimitive(value) && typeof value !== "symbol"
}

export type EmptyArray = never[]
export type EmptyObject = { [key: string]: never }

export type TemplatePrimitive = Exclude<Primitive, symbol>
