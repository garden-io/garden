/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginActionParamsBase } from "../../base.js"
import { projectActionParamsSchema } from "../../base.js"
import { dedent } from "../../../util/string.js"
import { environmentStatusSchema } from "../../../config/status.js"
import type { BaseProviderConfig } from "../../../config/provider.js"

export type GetEnvironmentStatusParams<C extends BaseProviderConfig = any> = PluginActionParamsBase<C>

export interface EnvironmentStatus<O extends {} = any, D extends {} = any> {
  ready: boolean
  detail?: D
  outputs: O
  disableCache?: boolean
  cached?: boolean
}

export const defaultEnvironmentStatus: EnvironmentStatus = {
  ready: true,
  outputs: {},
}

export interface EnvironmentStatusMap {
  [providerName: string]: EnvironmentStatus
}

export const getEnvironmentStatus = () => ({
  description: dedent`
    Check if the current environment is ready for use by this plugin. Use this action in combination
    with \`prepareEnvironment\`.

    Called before \`prepareEnvironment\`. If this returns \`ready: true\`, the
    \`prepareEnvironment\` action is not called.
  `,
  paramsSchema: projectActionParamsSchema(),
  resultSchema: environmentStatusSchema(),
})
