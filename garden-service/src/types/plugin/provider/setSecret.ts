/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginActionParamsBase } from "../base"
import { dedent } from "../../../util/string"
import { joiPrimitive, Primitive, joi } from "../../../config/common"
import { getSecretParamsSchema } from "./getSecret"

export interface SetSecretParams extends PluginActionParamsBase {
  key: string
  value: Primitive
}

export interface SetSecretResult {}

export const setSecret = {
  description: dedent`
    Set a secret for this plugin in the current environment. These variables are
    not used by the Garden framework, but the plugin may expose them to services etc. at runtime
    (e.g. as environment variables or mounted in containers).
  `,
  paramsSchema: getSecretParamsSchema.keys({
    value: joiPrimitive().description("The value of the secret."),
  }),
  resultSchema: joi.object().keys({}),
}
