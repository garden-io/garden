/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { actionParamsSchema, PluginDeployActionParamsBase } from "../../base"
import { dedent } from "../../../util/string"
import { ServiceStatus, serviceStatusSchema } from "../../../types/service"
import { RuntimeContext, runtimeContextSchema } from "../../../runtime-context"
import { joi } from "../../../config/common"
import { DeployAction } from "../../../actions/deploy"
import { ActionTypeHandlerSpec } from "../base/base"

interface GetDeployStatusParams<T extends DeployAction> extends PluginDeployActionParamsBase<T> {
  devMode: boolean
  hotReload: boolean
  runtimeContext: RuntimeContext
}

export class GetDeployStatus<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "deploy",
  GetDeployStatusParams<T>,
  ServiceStatus
> {
  description = dedent`
    Check and return the current runtime status of a deployment.

    Called ahead of any actions that expect a deployment to be running, as well as the \`garden get status\` command.
  `

  paramsSchema = () =>
    actionParamsSchema().keys({
      runtimeContext: runtimeContextSchema(),
      devMode: joi.boolean().default(false).description("Whether the deployment should be configured in dev mode."),
      hotReload: joi
        .boolean()
        .default(false)
        .description("Whether the deployment should be configured for hot-reloading."),
    })

  resultSchema = () => serviceStatusSchema()
}
