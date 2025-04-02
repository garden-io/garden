/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeployAction } from "../../../actions/deploy.js"
import type { PluginDeployActionParamsBase } from "../../../plugin/base.js"
import { actionParamsSchema } from "../../../plugin/base.js"
import { dedent } from "../../../util/string.js"
import type { ServiceStatus } from "../../../types/service.js"
import { serviceStatusSchema } from "../../../types/service.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { ActionStatus, Resolved } from "../../../actions/types.js"
import { createSchema } from "../../../config/common.js"
import { actionStatusSchema } from "../../../actions/base.js"

type DeleteDeployParams<T extends DeployAction> = PluginDeployActionParamsBase<T>

type DeleteDeployStatus<T extends DeployAction = DeployAction> = ActionStatus<T, ServiceStatus, {}>

export const getDeleteDeployResultSchema = createSchema({
  name: "delete-deploy-result",
  keys: () => ({
    detail: serviceStatusSchema,
  }),
  extend: actionStatusSchema,
})

export class DeleteDeploy<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  DeleteDeployParams<Resolved<T>>,
  DeleteDeployStatus<T>
> {
  description = dedent`
    Terminate a deployed service. This should wait until the service is no longer running.

    Called by the \`garden delete service\` command.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getDeleteDeployResultSchema()
}
