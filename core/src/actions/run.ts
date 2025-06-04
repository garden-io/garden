/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize } from "lodash-es"
import { joi } from "../config/common.js"
import type { BaseRuntimeActionConfig } from "./base.js"
import { baseRuntimeActionConfigSchema, ExecutedRuntimeAction, ResolvedRuntimeAction, RuntimeAction } from "./base.js"
import type { Action, BaseActionConfig } from "./types.js"
import { DEFAULT_RUN_TIMEOUT_SEC } from "../constants.js"
import { createRunTask } from "../tasks/run.js"
import type { BaseActionTaskParams, ExecuteTask } from "../tasks/base.js"
import { ResolveActionTask } from "../tasks/resolve-action.js"

export type RunActionConfig<N extends string = any, S extends object = any> = BaseRuntimeActionConfig<"Run", N, S>

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
  StaticOutputs extends Record<string, unknown> = any,
  RuntimeOutputs extends Record<string, unknown> = any,
> extends RuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind = "Run" as const
  override _staticOutputs: StaticOutputs = {} as StaticOutputs

  getExecuteTask(baseParams: Omit<BaseActionTaskParams, "action">): ExecuteTask {
    return createRunTask({ ...baseParams, action: this })
  }

  getResolveTask(baseParams: Omit<BaseActionTaskParams, "action">): ResolveActionTask<typeof this> {
    return new ResolveActionTask({ ...baseParams, action: this })
  }
}

export class ResolvedRunAction<
  C extends RunActionConfig = RunActionConfig,
  StaticOutputs extends Record<string, unknown> = any,
  RuntimeOutputs extends Record<string, unknown> = any,
> extends ResolvedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind = "Run" as const

  getExecuteTask(baseParams: Omit<BaseActionTaskParams, "action">): ExecuteTask {
    return createRunTask({ ...baseParams, action: this })
  }

  getResolveTask(baseParams: Omit<BaseActionTaskParams, "action">): ResolveActionTask<typeof this> {
    return new ResolveActionTask({ ...baseParams, action: this })
  }
}

export class ExecutedRunAction<
  C extends RunActionConfig = RunActionConfig,
  StaticOutputs extends Record<string, unknown> = any,
  RuntimeOutputs extends Record<string, unknown> = any,
> extends ExecutedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind = "Run" as const

  getExecuteTask(baseParams: Omit<BaseActionTaskParams, "action">): ExecuteTask {
    return createRunTask({ ...baseParams, action: this })
  }

  getResolveTask(baseParams: Omit<BaseActionTaskParams, "action">): ResolveActionTask<typeof this> {
    return new ResolveActionTask({ ...baseParams, action: this })
  }
}

export function isRunAction(action: Action): action is RunAction {
  return action.kind === "Run"
}

export function isRunActionConfig(config: BaseActionConfig): config is RunActionConfig {
  return config.kind === "Run"
}
