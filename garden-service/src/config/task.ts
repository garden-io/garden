/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiArray, joiUserIdentifier, joi } from "./common"
import { deline, dedent } from "../util/string"

export interface TaskSpec {}

export interface BaseTaskSpec extends TaskSpec {
  name: string
  dependencies: string[]
  description?: string
  disabled: boolean
  timeout: number | null
}

export const baseTaskSpecSchema = joi
  .object()
  .keys({
    name: joiUserIdentifier()
      .required()
      .description("The name of the task."),
    description: joi
      .string()
      .optional()
      .description("A description of the task."),
    dependencies: joiArray(joi.string()).description(deline`
        The names of any tasks that must be executed, and the names of any
        services that must be running, before this task is executed.
      `),
    disabled: joi
      .boolean()
      .default(false)
      .description(
        dedent`
          Set this to \`true\` to disable the task. You can use this with conditional template strings to
          enable/disable tasks based on, for example, the current environment or other variables (e.g.
          \`enabled: \${environment.name != "prod"}\`). This can be handy when you only want certain tasks to run in
          specific environments, e.g. only for development.

          Disabling a task means that it will not be run, and will also be ignored if it is declared as a
          runtime dependency for another service, test or task.

          Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to
          resolve when the task is disabled, so you need to make sure to provide alternate values for those if
          you're using them, using conditional expressions.
        `
      ),
    timeout: joi
      .number()
      .optional()
      .allow(null)
      .default(null)
      .description("Maximum duration (in seconds) of the task's execution."),
  })
  .description("Required configuration for module tasks.")

export interface TaskConfig<T extends TaskSpec = TaskSpec> extends BaseTaskSpec {
  // Plugins can add custom fields that are kept here
  spec: T
}

export const taskConfigSchema = baseTaskSpecSchema
  .keys({
    spec: joi
      .object()
      .meta({ extendable: true })
      .description("The task's specification, as defined by its provider plugin."),
  })
  .description("The configuration for a module's task.")

export const taskSchema = joi
  .object()
  .options({ presence: "required" })
  .keys({
    name: joiUserIdentifier().description("The name of the task."),
    description: joi
      .string()
      .optional()
      .description("A description of the task."),
    disabled: joi
      .boolean()
      .default(false)
      .description("Set to true if the task or its module is disabled."),
    module: joi.object().unknown(true),
    config: taskConfigSchema,
    spec: joi
      .object()
      .meta({ extendable: true })
      .description("The configuration of the task (specific to each plugin)."),
  })
