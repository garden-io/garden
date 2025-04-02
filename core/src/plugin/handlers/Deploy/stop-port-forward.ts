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
import type { ForwardablePort } from "../../../types/service.js"
import { forwardablePortKeys } from "../../../types/service.js"
import { joi } from "../../../config/common.js"
import type { DeployAction } from "../../../actions/deploy.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { Resolved } from "../../../actions/types.js"

type StopPortForwardParams<T extends DeployAction> = PluginDeployActionParamsBase<T> & ForwardablePort

export class StopDeployPortForward<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  StopPortForwardParams<Resolved<T>>,
  {}
> {
  description = dedent`
    Close a port forward created by \`getPortForward\`.
  `
  paramsSchema = () => actionParamsSchema().keys(forwardablePortKeys())
  resultSchema = () => joi.object().keys({})
}
