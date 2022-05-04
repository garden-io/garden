/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployAction } from "../../../actions/deploy"
import { actionParamsSchema, PluginDeployActionParamsBase } from "../../../plugin/base"
import { dedent } from "../../../util/string"
import { ServiceStatus, serviceStatusSchema } from "../../../types/service"
import { ActionTypeHandlerSpec } from "../base/base"
import { ActionStatus } from "../../../actions/base"

interface DeleteDeployParams<T extends DeployAction> extends PluginDeployActionParamsBase<T> {}

type DeleteDeployStatus<T extends DeployAction = DeployAction> = ActionStatus<T, ServiceStatus, {}>

export class DeleteDeploy<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  DeleteDeployParams<T>,
  DeleteDeployStatus<T>
> {
  description = dedent`
    Terminate a deployed service. This should wait until the service is no longer running.

    Called by the \`garden delete service\` command.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => serviceStatusSchema()
}
