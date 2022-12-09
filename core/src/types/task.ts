/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenModule } from "./module"
import { TaskConfig, taskConfigSchema } from "../config/task"
import { getEntityVersion } from "../vcs/vcs"
import { joi, joiUserIdentifier, moduleVersionSchema, versionStringSchema } from "../config/common"
import { executionResultSchema } from "../plugin/base"
import { deline } from "../util/string"
import { actionOutputsSchema } from "../plugin/handlers/base/base"

export interface GardenTask<M extends GardenModule = GardenModule> {
  name: string
  description?: string
  module: M
  disabled: boolean
  config: M["taskConfigs"][0]
  spec: M["taskConfigs"][0]["spec"]
  version: string
}

// Note: We're using "run" instead of "task" to refer to the action in the docstrings here to avoid referring to both
// the old and new namings in the generated reference docs.

export const taskSchema = () =>
  joi
    .object()
    .options({ presence: "required" })
    .keys({
      name: joiUserIdentifier().description("The name of the run."),
      description: joi.string().optional().description("A description of the run."),
      disabled: joi.boolean().default(false).description("Set to true if the run or its module is disabled."),
      module: joi.object().unknown(true),
      config: taskConfigSchema(),
      spec: joi
        .object()
        .meta({ extendable: true })
        .description("The configuration of the run (specific to each plugin)."),
      version: versionStringSchema().description("The version of the run."),
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

export const taskVersionSchema = () =>
  moduleVersionSchema().description(deline`
    The run action's version. In addition to the parent module's version, this also
    factors in the module versions of the run action's runtime dependencies (if any).`)

export const taskResultSchema = () =>
  joi.object().keys({
    outputs: actionOutputsSchema(),
    state: joi.string(),
    detail: executionResultSchema("run"),
  })
