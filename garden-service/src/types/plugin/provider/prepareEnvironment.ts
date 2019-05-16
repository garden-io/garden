/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { PluginActionParamsBase, actionParamsSchema } from "../base"
import { environmentStatusSchema, EnvironmentStatus } from "./getEnvironmentStatus"
import { dedent } from "../../../util/string"

export interface PrepareEnvironmentParams extends PluginActionParamsBase {
  status: EnvironmentStatus
  force: boolean
}

export interface PrepareEnvironmentResult { }

export const prepareEnvironment = {
  description: dedent`
    Make sure the environment is set up for this plugin. Use this action to do any bootstrapping required
    before deploying services.

    Called ahead of any service runtime actions (such as \`deployService\`,
    \`runModule\` and \`testModule\`), unless \`getEnvironmentStatus\` returns \`ready: true\` or
    \`needUserInput: true\`.

    Important: If your handler does require user input, please be sure to indicate that via the
    \`getEnvironmentStatus\` handler. If this provider's \`getEnvironmentStatus\` returns \`needUserInput: true\`,
    this is only called via the \`garden init\` command, so that the handler can safely request user input via
    the CLI.
  `,
  paramsSchema: actionParamsSchema
    .keys({
      status: environmentStatusSchema,
      force: Joi.boolean()
        .description("Force re-configuration of the environment."),
    }),
  resultSchema: Joi.object().keys({}),
}
