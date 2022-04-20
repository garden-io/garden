/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  runBaseParams,
  RunResult,
  artifactsPathSchema,
  PluginRunActionParamsBase,
  actionParamsSchema,
} from "../../../plugin/base"
import { dedent } from "../../../util/string"
import { RuntimeContext } from "../../../runtime-context"
import { taskResultSchema } from "../../../types/task"
import { PrimitiveMap } from "../../../config/common"
import { RunActionSpec } from "../../../actions/run"

export interface RunActionParams<T extends RunActionSpec = RunActionSpec> extends PluginRunActionParamsBase<T> {
  artifactsPath: string
  interactive: boolean
  runtimeContext: RuntimeContext
  timeout?: number
}

export interface RunActionResult extends RunResult {
  taskName: string
  outputs: PrimitiveMap
}

export const runTask = () => ({
  description: dedent`
    Runs a task within the context of its module. This should wait until execution completes, and
    return its output.
  `,
  paramsSchema: actionParamsSchema().keys(runBaseParams()).keys({
    artifactsPath: artifactsPathSchema(),
  }),
  resultSchema: taskResultSchema(),
})
