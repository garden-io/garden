/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize } from "lodash"
import { joi } from "../config/common"
import {
  BaseRuntimeActionConfig,
  baseRuntimeActionConfigSchema,
  ExecutedRuntimeAction,
  ResolvedRuntimeAction,
  RuntimeAction,
} from "./base"
import { Action, BaseActionConfig } from "./types"
import { DEFAULT_TEST_TIMEOUT_SEC } from "../constants"

export interface TestActionConfig<N extends string = any, S extends object = any>
  extends BaseRuntimeActionConfig<"Test", N, S> {}

export const testActionConfigSchema = memoize(() =>
  baseRuntimeActionConfigSchema().keys({
    kind: joi.string().allow("Test").only(),
    timeout: joi
      .number()
      .integer()
      .min(1)
      .default(DEFAULT_TEST_TIMEOUT_SEC)
      .description("Set a timeout for the test to complete, in seconds."),
  })
)

export class TestAction<
  C extends TestActionConfig = any,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> extends RuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind: "Test"
}

export class ResolvedTestAction<
  C extends TestActionConfig = any,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> extends ResolvedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind: "Test"
}

export class ExecutedTestAction<
  C extends TestActionConfig = any,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> extends ExecutedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind: "Test"
}

export function isTestAction(action: Action): action is TestAction {
  return action.kind === "Test"
}

export function isTestActionConfig(config: BaseActionConfig): config is TestActionConfig {
  return config.kind === "Test"
}
