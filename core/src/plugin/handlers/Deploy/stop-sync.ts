/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginDeployActionParamsBase } from "../../base.js"
import { actionParamsSchema } from "../../base.js"
import { dedent } from "../../../util/string.js"
import { joi } from "../../../config/common.js"
import type { DeployAction } from "../../../actions/deploy.js"
import { ActionTypeHandlerSpec } from "../base/base.js"

type StopSyncParams<T extends DeployAction> = PluginDeployActionParamsBase<T>

export class StopSync<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  StopSyncParams<T>,
  {}
> {
  description = dedent`
    Stop syncing to the given Deploy.
  `
  paramsSchema = () => actionParamsSchema()
  resultSchema = () => joi.object().keys({})
}
