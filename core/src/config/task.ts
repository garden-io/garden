/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiUserIdentifier, joi, joiSparseArray, createSchema } from "./common.js"
import { deline, dedent } from "../util/string.js"
import { memoize } from "lodash-es"
import { DEFAULT_RUN_TIMEOUT_SEC } from "../constants.js"

export type TaskSpec = object

export interface BaseTaskSpec extends TaskSpec {
  name: string
  dependencies: string[]
  description?: string
  disabled: boolean
  timeout: number
}

export const cacheResultSchema = memoize(() =>
  joi
    .boolean()
    .default(true)
    .description(
      dedent`
    Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any time your project (or one or more of the task's dependants) is deployed. Otherwise the task is only re-run when its version changes (i.e. the module or one of its dependencies is modified), or when you run \`garden run\`.
    `
    )
)

export const baseTaskSpecSchema = createSchema({
  name: "base-task-spec",
  description: "Required configuration for module tasks.",
  keys: () => ({
    name: joiUserIdentifier().required().description("The name of the task."),
    description: joi.string().optional().description("A description of the task."),
    dependencies: joiSparseArray(joi.string()).description(deline`
      The names of any tasks that must be executed, and the names of any services that must be running, before this task is executed.
    `),
    disabled: joi
      .boolean()
      .default(false)
      .description(
        dedent`
      Set this to \`true\` to disable the task. You can use this with conditional template strings to enable/disable tasks based on, for example, the current environment or other variables (e.g. \`enabled: \${environment.name != "prod"}\`). This can be handy when you only want certain tasks to run in specific environments, e.g. only for development.

      Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime dependency for another service, test or task.

      Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to resolve when the task is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.
      `
      ),
    timeout: joi
      .number()
      .integer()
      .min(1)
      .default(DEFAULT_RUN_TIMEOUT_SEC)
      .description("Maximum duration (in seconds) of the task's execution."),
  }),
})

export interface TaskConfig<T extends TaskSpec = TaskSpec> extends BaseTaskSpec {
  cacheResult: boolean
  // Plugins can add custom fields that are kept here
  spec: T
}

export const taskConfigSchema = createSchema({
  name: "task-config",
  description: "The configuration for a module's task.",
  extend: baseTaskSpecSchema,
  keys: () => ({
    cacheResult: cacheResultSchema(),
    spec: joi
      .object()
      .meta({ extendable: true })
      .description("The task's specification, as defined by its provider plugin."),
  }),
})
