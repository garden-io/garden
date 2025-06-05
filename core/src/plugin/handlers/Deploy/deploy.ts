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
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { DeployAction } from "../../../actions/deploy.js"
import type { DeployStatus } from "./get-status.js"
import { getDeployStatusSchema } from "./get-status.js"
import type { Resolved } from "../../../actions/types.js"

interface DeployParams<T extends DeployAction> extends PluginDeployActionParamsBase<T> {
  force: boolean
}

export class DoDeployAction<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  DeployParams<Resolved<T>>,
  DeployStatus<T>
> {
  description = dedent`
    Deploy the specified service. This should wait until the service is ready and accessible,
    and fail if the service doesn't reach a ready state.

    Called by the \`garden deploy\`command.
  `

  paramsSchema = () =>
    actionParamsSchema().keys({
      force: joi.boolean().description("Whether to force a re-deploy, even if the service is already deployed."),
    })

  resultSchema = () => getDeployStatusSchema()
}
