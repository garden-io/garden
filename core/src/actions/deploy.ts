/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize } from "lodash-es"
import { dedent } from "../util/string.js"
import { joi } from "../config/common.js"
import type { BaseRuntimeActionConfig } from "./base.js"
import { baseRuntimeActionConfigSchema, ExecutedRuntimeAction, ResolvedRuntimeAction, RuntimeAction } from "./base.js"
import type { Action, BaseActionConfig } from "./types.js"
import { DEFAULT_DEPLOY_TIMEOUT_SEC } from "../constants.js"
import { createDeployTask } from "../tasks/deploy.js"
import type { BaseActionTaskParams, ExecuteTask } from "../tasks/base.js"
import { ResolveActionTask } from "../tasks/resolve-action.js"
import { ActionConfigContext } from "../config/template-contexts/actions.js"

export interface DeployActionConfig<N extends string = any, S extends object = any>
  extends BaseRuntimeActionConfig<"Deploy", N, S> {
  removeOnCleanup?: boolean
}

export const deployActionConfigSchema = memoize(() =>
  baseRuntimeActionConfigSchema().keys({
    kind: joi.string().allow("Deploy").only(),
    timeout: joi
      .number()
      .integer()
      .min(1)
      .default(DEFAULT_DEPLOY_TIMEOUT_SEC)
      .description("Timeout for the deploy to complete, in seconds."),
    removeOnCleanup: joi
      .boolean()
      .default(true)
      .description(
        dedent`
        Set this to \`false\` to prevent this Deploy from being removed during \`garden cleanup deploy\` or \`garden cleanup namespace\` commands. This is useful for preventing the cleanup of persistent resources like PVCs or databases during cleanup operations.

        Use the \`--force\` flag on the cleanup commands to override this and clean up deploys regardless of this flag.
        `
      )
      .meta({ templateContext: ActionConfigContext }),
  })
)

export class DeployAction<
  C extends DeployActionConfig = any,
  StaticOutputs extends Record<string, unknown> = any,
  RuntimeOutputs extends Record<string, unknown> = any,
> extends RuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind = "Deploy" as const
  override _staticOutputs: StaticOutputs = {} as StaticOutputs

  getExecuteTask(baseParams: Omit<BaseActionTaskParams, "action">): ExecuteTask {
    return createDeployTask({ ...baseParams, action: this })
  }

  getResolveTask(baseParams: Omit<BaseActionTaskParams, "action">): ResolveActionTask<typeof this> {
    return new ResolveActionTask({ ...baseParams, action: this })
  }
}

export class ResolvedDeployAction<
  C extends DeployActionConfig = any,
  StaticOutputs extends Record<string, unknown> = any,
  RuntimeOutputs extends Record<string, unknown> = any,
> extends ResolvedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind = "Deploy" as const

  getExecuteTask(baseParams: Omit<BaseActionTaskParams, "action">): ExecuteTask {
    return createDeployTask({ ...baseParams, action: this })
  }

  getResolveTask(baseParams: Omit<BaseActionTaskParams, "action">): ResolveActionTask<typeof this> {
    return new ResolveActionTask({ ...baseParams, action: this })
  }
}

export class ExecutedDeployAction<
  C extends DeployActionConfig = any,
  StaticOutputs extends Record<string, unknown> = any,
  RuntimeOutputs extends Record<string, unknown> = any,
> extends ExecutedRuntimeAction<C, StaticOutputs, RuntimeOutputs> {
  override kind = "Deploy" as const

  getExecuteTask(baseParams: Omit<BaseActionTaskParams, "action">): ExecuteTask {
    return createDeployTask({ ...baseParams, action: this })
  }

  getResolveTask(baseParams: Omit<BaseActionTaskParams, "action">): ResolveActionTask<typeof this> {
    return new ResolveActionTask({ ...baseParams, action: this })
  }
}

export function isDeployAction(action: Action): action is DeployAction {
  return action.kind === "Deploy"
}

export function isDeployActionConfig(config: BaseActionConfig): config is DeployActionConfig {
  return config.kind === "Deploy"
}
