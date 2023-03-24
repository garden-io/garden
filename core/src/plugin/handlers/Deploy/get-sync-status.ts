/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { actionParamsSchema, PluginDeployActionParamsBase } from "../../base"
import { dedent } from "../../../util/string"
import { createSchema, joi, joiVariables } from "../../../config/common"
import { DeployAction } from "../../../actions/deploy"
import { ActionTypeHandlerSpec } from "../base/base"

type GetSyncStatusParams<T extends DeployAction> = PluginDeployActionParamsBase<T>

export const syncStates = ["active", "not-active", "failed", "unknown"] as const
export type SyncState = (typeof syncStates)[number]

export interface GetSyncStatusResult<D extends object> {
  state: SyncState
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
      .description("Whether the sync is active."),
    error: joi.string().description("Set to an error message if the sync is failed."),
    detail: joiVariables().description("Any additional detail to be included and printed with status checks."),
  },
})

export class GetSyncStatus<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  GetSyncStatusParams<T>,
  GetSyncStatusResult<any>
> {
  description = dedent`
    Get the sync status for the given Deploy.
  `
  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getSyncStatusResultSchema()
}
