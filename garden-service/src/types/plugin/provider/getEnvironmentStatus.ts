/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginActionParamsBase, actionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { PrimitiveMap } from "../../../config/common"
import { DashboardPage, environmentStatusSchema } from "../../../config/status"

export interface GetEnvironmentStatusParams extends PluginActionParamsBase {}

export interface EnvironmentStatus<T extends PrimitiveMap = PrimitiveMap> {
  ready: boolean
  dashboardPages?: DashboardPage[]
  detail?: any
  outputs: T
}

export const defaultEnvironmentStatus: EnvironmentStatus = {
  ready: true,
  outputs: {},
}

export interface EnvironmentStatusMap {
  [providerName: string]: EnvironmentStatus
}

export const getEnvironmentStatus = {
  description: dedent`
    Check if the current environment is ready for use by this plugin. Use this action in combination
    with \`prepareEnvironment\`.

    Called before \`prepareEnvironment\`. If this returns \`ready: true\`, the
    \`prepareEnvironment\` action is not called.
  `,
  paramsSchema: actionParamsSchema,
  resultSchema: environmentStatusSchema,
}
