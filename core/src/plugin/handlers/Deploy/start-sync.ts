/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { actionParamsSchema, PluginDeployActionParamsBase } from "../../base"
import { dedent } from "../../../util/string"
import { joi } from "../../../config/common"
import { DeployAction } from "../../../actions/deploy"
import { ActionTypeHandlerSpec } from "../base/base"
import { Executed } from "../../../actions/types"

type StartSyncParams<T extends DeployAction> = PluginDeployActionParamsBase<T>

export class StartSync<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  StartSyncParams<Executed<T>>,
  {}
> {
  description = dedent`
    Start syncing to the given deployment.
  `
  paramsSchema = () => actionParamsSchema()
  resultSchema = () => joi.object().keys({})
}
