/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { actionParamsSchema, PluginDeployActionParamsBase } from "../../base"
import { dedent } from "../../../util/string"
import { createSchema } from "../../../config/common"
import { DeployAction } from "../../../actions/deploy"
import { ActionTypeHandlerSpec } from "../base/base"
import { Executed } from "../../../actions/types"
import { actionStatusSchema } from "../../../actions/base"

type GetSyncStatusParams<T extends DeployAction> = PluginDeployActionParamsBase<T>

export const syncStatusDetailSchema = createSchema({
  name: "sync-status-detail",
  // TODO-G2: not sure yet which fields we need
  keys: {},
  allowUnknown: true,
})

export const getSyncStatusResultSchema = createSchema({
  name: "get-sync-status",
  keys: {
    detail: syncStatusDetailSchema,
  },
  extend: actionStatusSchema,
})

export class GetSyncStatus<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  GetSyncStatusParams<Executed<T>>,
  {}
> {
  description = dedent`
    Get the sync status for the given Deploy.
  `
  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getSyncStatusResultSchema()
}
