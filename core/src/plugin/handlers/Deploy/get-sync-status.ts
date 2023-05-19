/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { actionParamsSchema, PluginDeployActionParamsBase } from "../../base"
import { dedent } from "../../../util/string"
import { createSchema, joi, joiVariables } from "../../../config/common"
import type { DeployAction } from "../../../actions/deploy"
import { ActionTypeHandlerSpec } from "../base/base"
import type { Executed } from "../../../actions/types"
import { SyncMode, syncModeSchema } from "../../../plugins/container/config"

interface GetSyncStatusParams<T extends DeployAction> extends PluginDeployActionParamsBase<T> {
  monitor: boolean
}

export interface SyncStatus {
  source: string
  targetDescription: string
  state: SyncState
  /**
   * ISO format date string
   */
  lastSyncAt?: string
  syncCount?: number
  mode?: SyncMode
}

// TODO: maybe this should be the same as an ActionState
export const syncStates = [
  "not-deployed",
  "active",
  "not-active",
  "failed",
  "unknown",
  "outdated",
  "not-configured"
] as const
export type SyncState = (typeof syncStates)[number]

export interface GetSyncStatusResult<D extends object = {}> {
  state: SyncState
  syncs?: SyncStatus[]
  error?: string
  detail?: D
}

export const getSyncStatusResultSchema = createSchema({
  name: "get-sync-status-result",
  keys: {
    state: joi
      .string()
      .allow(...syncStates)
      .only()
      .required()
      .description("The Deploy-level sync status, based on the cumulative individual sync statuses."),
    syncs: joi.array().items(
      joi.object().keys({
        source: joi.string().required().description("The sync source as defined in the sync spec."),
        targetDescription: joi
          .string()
          .description(
            "A description of the sync target. This can include plugin specific information about the target to help accurately descibe it."
          ),
        state: joi
          .string()
          .required()
          .allow(...syncStates)
          .description("Whether the specific sync is active."),
        lastSyncAt: joi.string().description("ISO format date string for the last successful sync event. May not be availabe for all plugins."),
        syncCount: joi.number().description("The number of successful syncs. May not be availabe for all plugins."),
        mode: syncModeSchema(),
      })
    ).description("Should include an entry for every configured sync, also when their target isn't deployed in sync mode."),
    error: joi.string().description("Set to an error message if the sync is failed."),
    detail: joiVariables().description("Any additional detail to be included and printed with status checks."),
  },
})

export class GetSyncStatus<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  GetSyncStatusParams<Executed<T>>,
  GetSyncStatusResult<any>
> {
  description = dedent`
    Get the sync status for the given Deploy.
  `
  paramsSchema = () =>
    actionParamsSchema().keys({
      monitor: joi.boolean().required().description("Keep monitoring the sync and emit logs until aborted."),
    })
  resultSchema = () => getSyncStatusResultSchema()
}
