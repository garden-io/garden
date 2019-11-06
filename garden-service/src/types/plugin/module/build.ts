/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { PluginModuleActionParamsBase, moduleActionParamsSchema } from "../base"
import { joi } from "../../../config/common"

export interface BuildModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {}

export interface BuildResult {
  buildLog?: string
  fetched?: boolean
  fresh?: boolean
  version?: string
  details?: any
}

export const build = {
  description: dedent`
    Build the current version of a module. This must wait until the build is complete before returning.

    Called ahead of a number of actions, including \`deployService\` and \`publishModule\`.
  `,

  paramsSchema: moduleActionParamsSchema,

  resultSchema: joi.object().keys({
    buildLog: joi
      .string()
      .allow("")
      .description("The full log from the build."),
    fetched: joi.boolean().description("Set to true if the build was fetched from a remote registry."),
    fresh: joi
      .boolean()
      .description("Set to true if the build was performed, false if it was already built, or fetched from a registry"),
    version: joi.string().description("The version that was built."),
    details: joi.object().description("Additional information, specific to the provider."),
  }),
}
