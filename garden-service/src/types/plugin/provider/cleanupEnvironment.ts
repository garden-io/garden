/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginActionParamsBase, actionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { joi } from "../../../config/common"

export interface CleanupEnvironmentParams extends PluginActionParamsBase {}

export interface CleanupEnvironmentResult {}

export const cleanupEnvironment = {
  description: dedent`
    Clean up any runtime components, services etc. that this plugin has deployed in the environment.

    Like \`prepareEnvironment\`, this is executed sequentially, so handlers are allowed to request user input
    if necessary.

    Called by the \`garden delete environment\` command.
  `,
  paramsSchema: actionParamsSchema,
  resultSchema: joi.object().keys({}),
}
