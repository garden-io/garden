/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { actionParamsSchema, PluginDeployActionParamsBase } from "../../../plugin/base"
import { dedent } from "../../../util/string"
import { serviceStatusSchema } from "../../../types/service"
import { RuntimeContext, runtimeContextSchema } from "../../../runtime-context"
import { joi } from "../../../config/common"
import { DeployActionConfig } from "../../../actions/deploy"

export type hotReloadStatus = "enabled" | "disabled"

export interface GetDeployStatusParams<T extends DeployActionConfig = DeployActionConfig>
  extends PluginDeployActionParamsBase<T> {
  devMode: boolean
  hotReload: boolean
  runtimeContext: RuntimeContext
}

export const getDeployStatus = () => ({
  description: dedent`
    Check and return the current runtime status of a deployment.

    Called ahead of any actions that expect a deployment to be running, as well as the \`garden get status\` command.
  `,
  paramsSchema: actionParamsSchema().keys({
    runtimeContext: runtimeContextSchema(),
    devMode: joi.boolean().default(false).description("Whether the deployment should be configured in dev mode."),
    hotReload: joi
      .boolean()
      .default(false)
      .description("Whether the deployment should be configured for hot-reloading."),
  }),
  resultSchema: serviceStatusSchema(),
})
