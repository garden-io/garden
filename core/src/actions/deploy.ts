/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  BaseRuntimeActionConfig,
  baseRuntimeActionConfigSchema,
  ExecutedRuntimeAction,
  ResolvedRuntimeAction,
  RuntimeAction,
} from "./base"
import { Action, BaseActionConfig } from "./types"

export interface DeployActionConfig<N extends string = any, S extends object = any>
  extends BaseRuntimeActionConfig<"Deploy", N, S> {
  type: N
}

export const deployActionConfigSchema = () => baseRuntimeActionConfigSchema()

export class DeployAction<S extends DeployActionConfig = any, O extends {} = any> extends RuntimeAction<S, O> {
  kind: "Deploy"
}

export class ResolvedDeployAction<S extends DeployActionConfig = any, O extends {} = any> extends ResolvedRuntimeAction<
  S,
  O
> {
  kind: "Deploy"
}

export class ExecutedDeployAction<S extends DeployActionConfig = any, O extends {} = any> extends ExecutedRuntimeAction<
  S,
  O
> {
  kind: "Deploy"
}

export function isDeployAction(action: Action): action is DeployAction {
  return action.kind === "Deploy"
}

export function isDeployActionConfig(config: BaseActionConfig): config is DeployActionConfig {
  return config.kind === "Deploy"
}
