/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { taskActionParamsSchema, PluginTaskActionParamsBase } from "../../../plugin/base"
import { dedent } from "../../../util/string"
import { GardenModule } from "../../module"
import { taskResultSchema } from "../../task"

export interface GetTaskResultParams<T extends GardenModule = GardenModule> extends PluginTaskActionParamsBase<T> {}

export const getTaskResult = () => ({
  description: dedent`
    Retrieve the task result for the specified version. Use this along with the \`runTask\` handler
    to avoid running the same task repeatedly when its dependencies haven't changed.

    Note that the version string provided to this handler may be a hash of the module's version, as
    well as any runtime dependencies configured for the task, so it may not match the current version
    of the module itself.
  `,
  paramsSchema: taskActionParamsSchema(),
  resultSchema: taskResultSchema().allow(null),
})
