/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginActionParamsBase } from "../../base.js"
import { projectActionParamsSchema } from "../../base.js"
import { dedent } from "../../../util/string.js"
import { joi } from "../../../config/common.js"
import type { BaseProviderConfig } from "../../../config/provider.js"

export type CleanupEnvironmentParams<C extends BaseProviderConfig = any> = PluginActionParamsBase<C>

export type CleanupEnvironmentResult = object

export const cleanupEnvironment = () => ({
  description: dedent`
    Clean up any runtime components, services etc. that this plugin has deployed in the environment.

    Like \`prepareEnvironment\`, this is executed sequentially, so handlers are allowed to request user input
    if necessary.

    Called by the \`garden delete environment\` command.
  `,
  paramsSchema: projectActionParamsSchema(),
  resultSchema: joi.object(),
})
