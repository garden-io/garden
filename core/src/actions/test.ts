/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi } from "../config/common"
import { BaseRuntimeActionConfig, baseRuntimeActionConfig, Action } from "./base"

export interface TestActionConfig<S = any> extends BaseRuntimeActionConfig<S> {
  kind: "Test"
  timeout?: number
}

export const testActionConfig = () =>
  baseRuntimeActionConfig().keys({
    timeout: joi.number().integer().description("Set a timeout for the test to complete, in seconds."),
  })

export class TestAction<C extends TestActionConfig = TestActionConfig> extends Action<C> {}
