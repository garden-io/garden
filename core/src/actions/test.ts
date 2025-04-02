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
import { DEFAULT_TEST_TIMEOUT_SEC } from "../constants.js"
import type { BaseActionTaskParams, ExecuteTask } from "../tasks/base.js"
import { createTestTask } from "../tasks/test.js"
import { ResolveActionTask } from "../tasks/resolve-action.js"

export type TestActionConfig<N extends string = any, S extends object = any> = BaseRuntimeActionConfig<"Test", N, S>

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
  StaticOutputs extends Record<string, unknown> = any,
  RuntimeOutputs extends Record<string, unknown> = any,
> extends RuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind = "Test" as const
  override _staticOutputs: StaticOutputs = {} as StaticOutputs

  getExecuteTask(baseParams: Omit<BaseActionTaskParams, "action">): ExecuteTask {
    return createTestTask({ ...baseParams, action: this })
  }

  getResolveTask(baseParams: Omit<BaseActionTaskParams, "action">): ResolveActionTask<typeof this> {
    return new ResolveActionTask({ ...baseParams, action: this })
  }
}

export class ResolvedTestAction<
  C extends TestActionConfig = any,
  StaticOutputs extends Record<string, unknown> = any,
  RuntimeOutputs extends Record<string, unknown> = any,
> extends ResolvedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind = "Test" as const

  getExecuteTask(baseParams: Omit<BaseActionTaskParams, "action">): ExecuteTask {
    return createTestTask({ ...baseParams, action: this })
  }

  getResolveTask(baseParams: Omit<BaseActionTaskParams, "action">): ResolveActionTask<typeof this> {
    return new ResolveActionTask({ ...baseParams, action: this })
  }
}

export class ExecutedTestAction<
  C extends TestActionConfig = any,
  StaticOutputs extends Record<string, unknown> = any,
  RuntimeOutputs extends Record<string, unknown> = any,
> extends ExecutedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind = "Test" as const

  getExecuteTask(baseParams: Omit<BaseActionTaskParams, "action">): ExecuteTask {
    return createTestTask({ ...baseParams, action: this })
  }

  getResolveTask(baseParams: Omit<BaseActionTaskParams, "action">): ResolveActionTask<typeof this> {
    return new ResolveActionTask({ ...baseParams, action: this })
  }
}

export function isTestAction(action: Action): action is TestAction {
  return action.kind === "Test"
}

export function isTestActionConfig(config: BaseActionConfig): config is TestActionConfig {
  return config.kind === "Test"
}
