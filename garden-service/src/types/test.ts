/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Module } from "./module"
import { TestConfig } from "../config/test"

export interface Test<M extends Module = Module> {
  name: string
  module: M
  disabled: boolean
  config: M["testConfigs"][0]
  spec: M["testConfigs"][0]["spec"]
}

export function testFromConfig<M extends Module = Module>(module: M, config: TestConfig): Test<M> {
  return {
    name: config.name,
    module,
    disabled: module.disabled || config.disabled,
    config,
    spec: config.spec,
  }
}
