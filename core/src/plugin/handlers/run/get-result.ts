/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginRunActionParamsBase, actionParamsSchema, RunResult } from "../../base"
import { dedent } from "../../../util/string"
import { taskResultSchema } from "../../../types/task"
import { RunAction } from "../../../actions/run"
import { ActionTypeHandlerSpec } from "../base/base"

interface GetRunResultParams<T extends RunAction> extends PluginRunActionParamsBase<T> {}

export class GetRunActionResult<T extends RunAction = RunAction> extends ActionTypeHandlerSpec<
  "run",
  GetRunResultParams<T>,
  RunResult
> {
  description = dedent`
    Retrieve the Run result for the specified version.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => taskResultSchema().allow(null)
}
