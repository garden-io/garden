/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { PluginModuleActionParamsBase, moduleActionParamsSchema, runBaseParams, runResultSchema } from "../base"
import { RuntimeContext } from "../../../runtime-context"
import { joiArray, joi } from "../../../config/common"

export interface RunModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  command?: string[]
  args: string[]
  interactive: boolean
  runtimeContext: RuntimeContext
  ignoreError?: boolean
  timeout?: number
}

export const runModuleBaseSchema = moduleActionParamsSchema.keys(runBaseParams)

export const runModuleParamsSchema = runModuleBaseSchema.keys({
  command: joiArray(joi.string())
    .optional()
    .description("The command/entrypoint to run in the module."),
  args: joiArray(joi.string()).description("The arguments passed to the command/entrypoint to run in the module."),
})

export const runModule = {
  description: dedent`
    Run an ad-hoc instance of the specified module. This should wait until the execution completes,
    and should ideally attach it to the terminal (i.e. pipe the output from the service
    to the console, as well as pipe the input from the console to the running service).

    Called by the \`garden run module\` command.
  `,
  paramsSchema: runModuleParamsSchema,
  resultSchema: runResultSchema,
}
