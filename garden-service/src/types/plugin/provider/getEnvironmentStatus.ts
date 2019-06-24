/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DashboardPage, dashboardPagesSchema } from "../../../config/dashboard"
import { PluginActionParamsBase, actionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { joi } from "../../../config/common"

export interface GetEnvironmentStatusParams extends PluginActionParamsBase { }

export interface EnvironmentStatus {
  ready: boolean
  needManualInit?: boolean
  dashboardPages?: DashboardPage[]
  detail?: any
}

export interface EnvironmentStatusMap {
  [providerName: string]: EnvironmentStatus
}

export const environmentStatusSchema = joi.object()
  .keys({
    ready: joi.boolean()
      .required()
      .description("Set to true if the environment is fully configured for a provider."),
    needManualInit: joi.boolean()
      .description(
        "Set to true if the environment needs user input to be initialized, " +
        "and thus needs to be initialized via `garden init`.",
      ),
    dashboardPages: dashboardPagesSchema,
    detail: joi.object()
      .meta({ extendable: true })
      .description("Use this to include additional information that is specific to the provider."),
  })
  .description("Description of an environment's status for a provider.")

export const getEnvironmentStatus = {
  description: dedent`
    Check if the current environment is ready for use by this plugin. Use this action in combination
    with \`prepareEnvironment\`.

    Called before \`prepareEnvironment\`. If this returns \`ready: true\`, the
    \`prepareEnvironment\` action is not called.

    If this returns \`needManualInit: true\`, the process may throw an error and guide the user to
    run \`garden init\`. Otherwise the \`prepareEnvironment\` handler may be run implicitly ahead of
    actions like \`deployService\`, \`runModule\` etc.
  `,
  paramsSchema: actionParamsSchema,
  resultSchema: environmentStatusSchema,
}
