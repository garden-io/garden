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
import { DEFAULT_RUN_TIMEOUT_SEC } from "../constants"

export interface RunActionConfig<N extends string = any, S extends object = any>
  extends BaseRuntimeActionConfig<"Run", N, S> {}

export const runActionConfigSchema = memoize(() =>
  baseRuntimeActionConfigSchema().keys({
    kind: joi.string().allow("Run").only(),
    timeout: joi
      .number()
      .integer()
      .min(1)
      .default(DEFAULT_RUN_TIMEOUT_SEC)
      .description("Set a timeout for the run to complete, in seconds."),
  })
)

export class RunAction<
  C extends RunActionConfig = RunActionConfig,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> extends RuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind: "Run"
}

export class ResolvedRunAction<
  C extends RunActionConfig = RunActionConfig,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> extends ResolvedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind: "Run"
}

export class ExecutedRunAction<
  C extends RunActionConfig = RunActionConfig,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> extends ExecutedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind: "Run"
}

export function isRunAction(action: Action): action is RunAction {
  return action.kind === "Run"
}

export function isRunActionConfig(config: BaseActionConfig): config is RunActionConfig {
  return config.kind === "Run"
}
