/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginRunActionParamsBase, RunResult } from "../../base.js"
import { actionParamsSchema, runResultSchema } from "../../base.js"
import { dedent } from "../../../util/string.js"
import type { RunAction } from "../../../actions/run.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import { actionStatusSchema } from "../../../actions/base.js"
import type { ActionStatus, ActionStatusMap, Resolved } from "../../../actions/types.js"
import { createSchema } from "../../../config/common.js"

type GetRunResultParams<T extends RunAction> = PluginRunActionParamsBase<T>

export type GetRunResult<T extends RunAction = RunAction> = ActionStatus<T, RunResult>

export interface RunStatusMap extends ActionStatusMap<RunAction> {
  [key: string]: GetRunResult
}

export const getRunResultSchema = createSchema({
  name: "get-run-result",
  keys: () => ({
    detail: runResultSchema().allow(null),
  }),
  extend: actionStatusSchema,
})

export class GetRunActionResult<T extends RunAction> extends ActionTypeHandlerSpec<
  "Run",
  GetRunResultParams<Resolved<T>>,
  GetRunResult<T>
> {
  description = dedent`
    Retrieve the Run result for the specified version.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getRunResultSchema()
}
