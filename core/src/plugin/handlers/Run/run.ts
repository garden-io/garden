/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginRunActionParamsBase } from "../../../plugin/base.js"
import { runBaseParams, actionParamsSchema } from "../../../plugin/base.js"
import { dedent } from "../../../util/string.js"
import type { RunAction } from "../../../actions/run.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { GetRunResult } from "./get-result.js"
import { getRunResultSchema } from "./get-result.js"
import type { Resolved } from "../../../actions/types.js"

export interface CommonRunParams {
  artifactsPath: string
  interactive: boolean
}

type RunActionParams<T extends RunAction> = PluginRunActionParamsBase<T> & CommonRunParams

export class RunRunAction<T extends RunAction = RunAction> extends ActionTypeHandlerSpec<
  "Run",
  RunActionParams<Resolved<T>>,
  GetRunResult<T>
> {
  description = dedent`
    Performs a Run. This should wait until execution completes, and return its output.
  `

  paramsSchema = () => actionParamsSchema().keys(runBaseParams())
  resultSchema = () => getRunResultSchema()
}
