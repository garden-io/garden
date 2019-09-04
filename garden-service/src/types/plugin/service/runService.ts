/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginServiceActionParamsBase, serviceActionParamsSchema, runBaseParams, runResultSchema } from "../base"
import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { RuntimeContext } from "../../../runtime-context"

export interface RunServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  interactive: boolean
  runtimeContext: RuntimeContext
  timeout?: number
}

export const runService = {
  description: dedent`
    Run an ad-hoc instance of the specified service. This should wait until the service completes
    execution, and should ideally attach it to the terminal (i.e. pipe the output from the service
    to the console, as well as pipe the input from the console to the running service).

    Called by the \`garden run service\` command.
  `,
  paramsSchema: serviceActionParamsSchema.keys(runBaseParams),
  resultSchema: runResultSchema,
}
