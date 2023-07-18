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
import { DEFAULT_DEPLOY_TIMEOUT_SEC } from "../constants"

export interface DeployActionConfig<N extends string = any, S extends object = any>
  extends BaseRuntimeActionConfig<"Deploy", N, S> {}

export const deployActionConfigSchema = memoize(() =>
  baseRuntimeActionConfigSchema().keys({
    kind: joi.string().allow("Deploy").only(),
    timeout: joi
      .number()
      .integer()
      .min(1)
      .default(DEFAULT_DEPLOY_TIMEOUT_SEC)
      .description("Timeout for the deploy to complete, in seconds."),
  })
)

export class DeployAction<
  C extends DeployActionConfig = any,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> extends RuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind: "Deploy"
}

export class ResolvedDeployAction<
  C extends DeployActionConfig = any,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> extends ResolvedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind: "Deploy"
}

export class ExecutedDeployAction<
  C extends DeployActionConfig = any,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> extends ExecutedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind: "Deploy"
}

export function isDeployAction(action: Action): action is DeployAction {
  return action.kind === "Deploy"
}

export function isDeployActionConfig(config: BaseActionConfig): config is DeployActionConfig {
  return config.kind === "Deploy"
}
