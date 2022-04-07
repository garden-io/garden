/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginServiceActionParamsBase, serviceActionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { GardenModule } from "../../module"
import { serviceStatusSchema } from "../../service"
import { RuntimeContext, runtimeContextSchema } from "../../../runtime-context"
import { joi } from "../../../config/common"

export type hotReloadStatus = "enabled" | "disabled"

export interface GetServiceStatusParams<M extends GardenModule = GardenModule, S extends GardenModule = GardenModule>
  extends PluginServiceActionParamsBase<M, S> {
  devMode: boolean
  hotReload: boolean
  localMode: boolean
  runtimeContext: RuntimeContext
}

export const getServiceStatus = () => ({
  description: dedent`
    Check and return the current runtime status of a service.

    Called ahead of any actions that expect a service to be running, as well as the
    \`garden get status\` command.

    NOTE: This handler should not use the build directory since it's not guaranteed
    that the build will be staged or completed before this handler is called.
  `,
  paramsSchema: serviceActionParamsSchema().keys({
    runtimeContext: runtimeContextSchema(),
    devMode: joi.boolean().default(false).description("Whether the service should be configured in dev mode."),
    hotReload: joi.boolean().default(false).description("Whether the service should be configured for hot-reloading."),
    localMode: joi.boolean().default(false).description("Whether the service should be configured in local mode."),
  }),
  resultSchema: serviceStatusSchema(),
})
