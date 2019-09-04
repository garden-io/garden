/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginActionParamsBase, actionParamsSchema } from "../base"
import { EnvironmentStatus } from "./getEnvironmentStatus"
import { dedent } from "../../../util/string"
import { joi } from "../../../config/common"
import { environmentStatusSchema } from "../../../config/status"

export interface PrepareEnvironmentParams extends PluginActionParamsBase {
  status: EnvironmentStatus
  force: boolean
}

export interface PrepareEnvironmentResult {
  status: EnvironmentStatus
}

export const prepareEnvironment = {
  description: dedent`
    Make sure the environment is set up for this plugin. Use this action to do any bootstrapping required
    before deploying services.

    Called ahead of any service runtime actions (such as \`deployService\`,
    \`runModule\` and \`testModule\`), unless \`getEnvironmentStatus\` returns \`ready: true\`.
  `,
  paramsSchema: actionParamsSchema.keys({
    force: joi.boolean().description("Force re-configuration of the environment."),
    status: environmentStatusSchema,
  }),
  resultSchema: joi.object().keys({
    status: environmentStatusSchema,
  }),
}
