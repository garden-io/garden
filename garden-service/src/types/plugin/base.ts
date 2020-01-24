/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../../logger/log-entry"
import { PluginContext, pluginContextSchema } from "../../plugin-context"
import { Module, moduleSchema } from "../module"
import { RuntimeContext, runtimeContextSchema } from "../../runtime-context"
import { Service, serviceSchema } from "../service"
import { Task } from "../task"
import { taskSchema } from "../../config/task"
import { joi } from "../../config/common"
import { ActionHandlerParamsBase } from "./plugin"

export interface PluginActionContextParams extends ActionHandlerParamsBase {
  ctx: PluginContext
}

export interface PluginActionParamsBase extends PluginActionContextParams {
  log: LogEntry
}

// Note: not specifying this further because we will later remove it from the API
export const logEntrySchema = joi
  .object()
  .description("Logging context handler that the handler can use to log messages and progress.")
  .required()

export const actionParamsSchema = joi.object().keys({
  ctx: pluginContextSchema.required(),
  log: logEntrySchema,
})

export interface PluginModuleActionParamsBase<T extends Module = Module> extends PluginActionParamsBase {
  module: T
}
export const moduleActionParamsSchema = actionParamsSchema.keys({
  module: moduleSchema,
})

export interface PluginServiceActionParamsBase<M extends Module = Module, S extends Module = Module>
  extends PluginModuleActionParamsBase<M> {
  runtimeContext?: RuntimeContext
  service: Service<M, S>
}
export const serviceActionParamsSchema = moduleActionParamsSchema.keys({
  runtimeContext: runtimeContextSchema.optional(),
  service: serviceSchema,
})

export interface PluginTaskActionParamsBase<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  task: Task<T>
}
export const taskActionParamsSchema = moduleActionParamsSchema.keys({
  task: taskSchema,
})

export const runBaseParams = {
  interactive: joi.boolean().description("Whether to run the module interactively (i.e. attach to the terminal)."),
  runtimeContext: runtimeContextSchema,
  silent: joi.boolean().description("Set to false if the output should not be logged to the console."),
  timeout: joi
    .number()
    .optional()
    .description("If set, how long to run the command before timing out."),
}

export interface RunResult {
  // FIXME: this field can always be inferred
  moduleName: string
  // FIXME: this field is overly specific, consider replacing with more generic metadata field(s)
  command: string[]
  // FIXME: this field can always be inferred
  version: string
  success: boolean
  // FIXME: we should avoid native Date objects
  startedAt: Date
  completedAt: Date
  log: string
  // DEPRECATED
  output?: string
}

export const runResultSchema = joi
  .object()
  .unknown(true)
  .keys({
    moduleName: joi.string().description("The name of the module that was run."),
    command: joi
      .array()
      .items(joi.string())
      .required()
      .description("The command that was run in the module."),
    version: joi.string().description("The string version of the module."),
    success: joi
      .boolean()
      .required()
      .description("Whether the module was successfully run."),
    startedAt: joi
      .date()
      .required()
      .description("When the module run was started."),
    completedAt: joi
      .date()
      .required()
      .description("When the module run was completed."),
    log: joi
      .string()
      .allow("")
      .default("")
      .description("The output log from the run."),
    output: joi
      .string()
      .allow("")
      .description("[DEPRECATED - use `log` instead] The output log from the run."),
  })

export const artifactsPathSchema = joi
  .string()
  .required()
  .description("A directory path where the handler should write any exported artifacts to.")
