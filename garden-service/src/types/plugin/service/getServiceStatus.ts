/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginServiceActionParamsBase, serviceActionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { serviceStatusSchema } from "../../service"
import { RuntimeContext, runtimeContextSchema } from "../../../runtime-context"
import { joi } from "../../../config/common"

export type hotReloadStatus = "enabled" | "disabled"

export interface GetServiceStatusParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  hotReload: boolean
  runtimeContext: RuntimeContext
}

export const getServiceStatus = {
  description: dedent`
    Check and return the current runtime status of a service.

    Called ahead of any actions that expect a service to be running, as well as the
    \`garden get status\` command.
  `,
  paramsSchema: serviceActionParamsSchema.keys({
    runtimeContext: runtimeContextSchema,
    hotReload: joi
      .boolean()
      .default(false)
      .description("Whether the service should be configured for hot-reloading."),
  }),
  resultSchema: serviceStatusSchema,
}
