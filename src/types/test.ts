/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import {
  joiIdentifier,
  joiVariables,
  PrimitiveMap,
} from "./common"

export interface TestSpec { }

export interface BaseTestSpec extends TestSpec {
  name: string
  dependencies: string[]
  variables: PrimitiveMap
  timeout: number | null
}

export const baseTestSpecSchema = Joi.object().keys({
  name: joiIdentifier().required(),
  dependencies: Joi.array().items(Joi.string()).default(() => [], "[]"),
  variables: joiVariables(),
  timeout: Joi.number().allow(null).default(null),
})

export interface TestConfig<T extends TestSpec = TestSpec> extends BaseTestSpec {
  // Plugins can add custom fields that are kept here
  spec: T
}

export const testConfigSchema = baseTestSpecSchema.keys({
  spec: Joi.object(),
})
