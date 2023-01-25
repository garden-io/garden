/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi } from "../config/common"
import {
  BaseRuntimeActionConfig,
  baseRuntimeActionConfigSchema,
  ExecutedRuntimeAction,
  ResolvedRuntimeAction,
  RuntimeAction,
} from "./base"
import { Action, BaseActionConfig } from "./types"

export interface RunActionConfig<N extends string = any, S extends object = any>
  extends BaseRuntimeActionConfig<"Run", N, S> {
  type: N
  timeout?: number
}

export const runActionConfigSchema = () =>
  baseRuntimeActionConfigSchema().keys({
    timeout: joi.number().integer().description("Set a timeout for the run to complete, in seconds."),
  })

export class RunAction<C extends RunActionConfig = RunActionConfig, O extends {} = any> extends RuntimeAction<C, O> {
  kind: "Run"
}

export class ResolvedRunAction<
  C extends RunActionConfig = RunActionConfig,
  O extends {} = any
> extends ResolvedRuntimeAction<C, O> {
  kind: "Run"
}

export class ExecutedRunAction<
  C extends RunActionConfig = RunActionConfig,
  O extends {} = any
> extends ExecutedRuntimeAction<C, O> {
  kind: "Run"
}

export function isRunAction(action: Action): action is RunAction {
  return action.kind === "Run"
}

export function isRunActionConfig(config: BaseActionConfig): config is RunActionConfig {
  return config.kind === "Run"
}
