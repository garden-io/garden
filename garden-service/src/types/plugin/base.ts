/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { LogEntry } from "../../logger/log-entry"
import { PluginContext, pluginContextSchema } from "../../plugin-context"
import { Module, moduleSchema } from "../module"
import { RuntimeContext, Service, serviceSchema, runtimeContextSchema } from "../service"
import { Task } from "../task"
import { taskSchema } from "../../config/task"
import { ModuleVersion, moduleVersionSchema } from "../../vcs/vcs"

export interface PluginActionContextParams {
  ctx: PluginContext
}

export interface PluginActionParamsBase extends PluginActionContextParams {
  log: LogEntry
}

// Note: not specifying this further because we will later remove it from the API
export const logEntrySchema = Joi.object()
  .description("Logging context handler that the handler can use to log messages and progress.")
  .required()

export const actionParamsSchema = Joi.object()
  .keys({
    ctx: pluginContextSchema
      .required(),
    log: logEntrySchema,
  })

export interface PluginModuleActionParamsBase<T extends Module = Module> extends PluginActionParamsBase {
  module: T
}
export const moduleActionParamsSchema = actionParamsSchema
  .keys({
    module: moduleSchema,
  })

export interface PluginServiceActionParamsBase<M extends Module = Module, S extends Module = Module>
  extends PluginModuleActionParamsBase<M> {
  runtimeContext?: RuntimeContext
  service: Service<M, S>
}
export const serviceActionParamsSchema = moduleActionParamsSchema
  .keys({
    runtimeContext: runtimeContextSchema
      .optional(),
    service: serviceSchema,
  })

export interface PluginTaskActionParamsBase<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  task: Task<T>
}
export const taskActionParamsSchema = moduleActionParamsSchema
  .keys({
    task: taskSchema,
  })

export const runBaseParams = {
  interactive: Joi.boolean()
    .description("Whether to run the module interactively (i.e. attach to the terminal)."),
  runtimeContext: runtimeContextSchema,
  silent: Joi.boolean()
    .description("Set to false if the output should not be logged to the console."),
  timeout: Joi.number()
    .optional()
    .description("If set, how long to run the command before timing out."),
}

export interface RunResult {
  moduleName: string
  command: string[]
  version: ModuleVersion
  success: boolean
  startedAt: Date
  completedAt: Date
  output: string
}

export const runResultSchema = Joi.object()
  .keys({
    moduleName: Joi.string()
      .description("The name of the module that was run."),
    command: Joi.array().items(Joi.string())
      .required()
      .description("The command that was run in the module."),
    version: moduleVersionSchema,
    success: Joi.boolean()
      .required()
      .description("Whether the module was successfully run."),
    startedAt: Joi.date()
      .required()
      .description("When the module run was started."),
    completedAt: Joi.date()
      .required()
      .description("When the module run was completed."),
    output: Joi.string()
      .required()
      .allow("")
      .description("The output log from the run."),
  })
