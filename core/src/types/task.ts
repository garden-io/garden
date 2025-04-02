/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize } from "lodash-es"
import type { GardenModule } from "./module.js"
import type { TaskConfig } from "../config/task.js"
import { taskConfigSchema } from "../config/task.js"
import { getEntityVersion } from "../vcs/vcs.js"
import { joi, joiUserIdentifier, moduleVersionSchema, versionStringSchema, createSchema } from "../config/common.js"
import { deline } from "../util/string.js"

export interface GardenTask<M extends GardenModule = GardenModule> {
  name: string
  description?: string
  module: M
  disabled: boolean
  config: M["taskConfigs"][0]
  spec: M["taskConfigs"][0]["spec"]
  version: string
}

export const taskSchema = createSchema({
  name: "module-task",
  keys: () => ({
    name: joiUserIdentifier().description("The name of the task."),
    description: joi.string().optional().description("A description of the task."),
    disabled: joi.boolean().default(false).description("Set to true if the task or its module is disabled."),
    module: joi.object().unknown(true),
    config: taskConfigSchema(),
    spec: joi
      .object()
      .meta({ extendable: true })
      .description("The configuration of the task (specific to each plugin)."),
    version: versionStringSchema().description("The version of the task."),
  }),
  options: { presence: "required" },
})

export function taskFromConfig<M extends GardenModule = GardenModule>(module: M, config: TaskConfig): GardenTask<M> {
  return {
    name: config.name,
    module,
    disabled: module.disabled || config.disabled,
    config,
    spec: config.spec,
    version: getEntityVersion(module, config),
  }
}

export const taskVersionSchema = memoize(() =>
  moduleVersionSchema().description(deline`
    The task run's version. In addition to the parent module's version, this also
    factors in the module versions of the tasks' runtime dependencies (if any).`)
)
