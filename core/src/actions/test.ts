/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize } from "lodash"
import { createSchema, joi } from "../config/common"
import {
  BaseRuntimeActionConfig,
  baseRuntimeActionConfigSchema,
  ExecutedRuntimeAction,
  ResolvedRuntimeAction,
  RuntimeAction,
} from "./base"
import { Action, BaseActionConfig } from "./types"
import { DEFAULT_TEST_TIMEOUT_SEC } from "../constants"
import { BaseActionTaskParams, ExecuteTask } from "../tasks/base"
import { createTestTask } from "../tasks/test"
import { ResolveActionTask } from "../tasks/resolve-action"

export type TestActionConfig<N extends string = any, S extends object = any> = BaseRuntimeActionConfig<"Test", N, S>

export enum CacheStrategy {
  Never = "never",
  CodeOnly = "code-only",
  TemplateAndCode = "template-and-code",
}

const cacheConfigSchema = createSchema({
  name: "action-cache-config",
  keys: () => ({
    strategy: joi.string().valid(...Object.values(CacheStrategy)).default(CacheStrategy.TemplateAndCode).description(`
    Set the cache strategy for action. The default is "template-and-code".
    `),
  }),
})

export const testActionConfigSchema = memoize(() =>
  baseRuntimeActionConfigSchema().keys({
    kind: joi.string().allow("Test").only(),
    timeout: joi
      .number()
      .integer()
      .min(1)
      .default(DEFAULT_TEST_TIMEOUT_SEC)
      .description("Set a timeout for the test to complete, in seconds."),
    cache: cacheConfigSchema(),
  })
)

export class TestAction<
  C extends TestActionConfig = any,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
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
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
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
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
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
