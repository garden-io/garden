/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { runBaseParams, runResultSchema, actionParamsSchema, PluginBuildActionParamsBase } from "../../../plugin/base"
import { RuntimeContext } from "../../../runtime-context"
import { joiArray, joi } from "../../../config/common"
import { BuildActionSpec } from "../../../actions/build"

// TODO: remove in 0.13? Seems out of place now.

export interface RunBuildParams<T extends BuildActionSpec = BuildActionSpec> extends PluginBuildActionParamsBase<T> {
  command?: string[]
  args: string[]
  interactive: boolean
  runtimeContext: RuntimeContext
  timeout?: number
}

export const runBuildBaseSchema = () => actionParamsSchema().keys(runBaseParams())

export const runBuildParamsSchema = () =>
  runBuildBaseSchema().keys({
    command: joiArray(joi.string()).optional().description("The command/entrypoint to run in the build."),
    args: joiArray(joi.string()).description("The arguments passed to the command/entrypoint to run in the build."),
  })

export const runModule = () => ({
  description: dedent`
    Run an ad-hoc instance of the specified build. This should wait until the execution completes, and should ideally attach it to the terminal (i.e. pipe the output from the service to the console, as well as pipe the input from the console to the running service).

    Called by the \`garden run build\` (formerly \`garden run module\`) command.
  `,
  paramsSchema: runBuildParamsSchema(),
  resultSchema: runResultSchema(),
})
