/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { taskActionParamsSchema, PluginTaskActionParamsBase, runBaseParams, RunResult } from "../base"
import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { RuntimeContext } from "../../../runtime-context"
import { ModuleVersion } from "../../../vcs/vcs"
import { taskVersionSchema, taskResultSchema } from "./getTaskResult"
import { PrimitiveMap } from "../../../config/common"

export interface RunTaskParams<T extends Module = Module> extends PluginTaskActionParamsBase<T> {
  interactive: boolean
  runtimeContext: RuntimeContext
  taskVersion: ModuleVersion
  timeout?: number
}

export interface RunTaskResult extends RunResult {
  taskName: string
  outputs: PrimitiveMap
}

export const runTask = {
  description: dedent`
    Runs a task within the context of its module. This should wait until execution completes, and
    return its output.
  `,
  paramsSchema: taskActionParamsSchema.keys(runBaseParams).keys({ taskVersion: taskVersionSchema }),
  resultSchema: taskResultSchema,
}
