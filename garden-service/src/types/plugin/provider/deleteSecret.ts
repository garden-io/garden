/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { PluginActionParamsBase } from "../base"
import { dedent } from "../../../util/string"
import { getSecretParamsSchema } from "./getSecret"

export interface DeleteSecretParams extends PluginActionParamsBase {
  key: string
}

export interface DeleteSecretResult {
  found: boolean
}

export const deleteSecret = {
  description: dedent`
    Remove a secret for this plugin in the current environment (as set via \`setSecret\`).
  `,
  paramsSchema: getSecretParamsSchema,
  resultSchema: Joi.object()
    .keys({
      found: Joi.boolean()
        .required()
        .description("Set to true if the key was deleted, false if it was not found."),
    }),
}
