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

export interface GetSecretParams extends PluginActionParamsBase {
  key: string
}

export interface GetSecretResult {
  value: string | null
}

export const getSecretParamsSchema = actionParamsSchema.keys({
  key: joi.string().description("A unique identifier for the secret."),
})

export const getSecret = {
  description: dedent`
    Retrieve a secret value for this plugin in the current environment (as set via \`setSecret\`).
  `,
  paramsSchema: getSecretParamsSchema,
  resultSchema: joi.object().keys({
    value: joi
      .string()
      .allow(null)
      .required()
      .description("The config value found for the specified key (as string), or null if not found."),
  }),
}
