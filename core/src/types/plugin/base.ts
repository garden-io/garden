/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../../logger/log-entry"
import { PluginContext, pluginContextSchema, PluginEventBroker } from "../../plugin-context"
import { GardenModule, moduleSchema } from "../module"
import { RuntimeContext, runtimeContextSchema } from "../../runtime-context"
import { GardenService, serviceSchema } from "../service"
import { GardenTask } from "../task"
import { taskSchema } from "../../types/task"
import { joi, joiIdentifier } from "../../config/common"
import { ActionHandlerParamsBase } from "./plugin"
import { deline } from "../../util/string"

export interface PluginActionContextParams extends ActionHandlerParamsBase {
  ctx: PluginContext
}

export interface PluginActionParamsBase extends PluginActionContextParams {
  events?: PluginEventBroker
  log: LogEntry
}

// Note: not specifying this further because we will later remove it from the API
export const logEntrySchema = () =>
  joi.object().description("Logging context handler that the handler can use to log messages and progress.").required()

export const pluginEventBrokerSchema = () =>
  joi.object().description(deline`
    Event broker that the handler can use to emit events that are handled by the action and/or command that called it.
  `)

export const actionParamsSchema = () =>
  joi.object().keys({
    ctx: pluginContextSchema().required(),
    log: logEntrySchema(),
    events: pluginEventBrokerSchema(),
  })

export type NamespaceState = "ready" | "missing"

// When needed, we can make this type generic and add e.g. a detail for plugin-specific metadata.
export interface NamespaceStatus {
  pluginName: string
  namespaceName: string
  state: NamespaceState
}

export const namespaceStatusSchema = () =>
  joi.object().keys({
    pluginName: joi.string(),
    namespaceName: joiIdentifier(),
    state: joi.string().valid("ready", "missing"),
  })

export const namespaceStatusesSchema = () => joi.array().items(namespaceStatusSchema())

export interface PluginModuleActionParamsBase<T extends GardenModule = GardenModule> extends PluginActionParamsBase {
  module: T
}
export const moduleActionParamsSchema = () =>
  actionParamsSchema().keys({
    module: moduleSchema(),
  })

export interface PluginServiceActionParamsBase<
  M extends GardenModule = GardenModule,
  S extends GardenModule = GardenModule
> extends PluginModuleActionParamsBase<M> {
  runtimeContext?: RuntimeContext
  service: GardenService<M, S>
}
export const serviceActionParamsSchema = () =>
  moduleActionParamsSchema().keys({
    runtimeContext: runtimeContextSchema().optional(),
    service: serviceSchema(),
  })

export interface PluginTaskActionParamsBase<T extends GardenModule = GardenModule>
  extends PluginModuleActionParamsBase<T> {
  task: GardenTask<T>
}
export const taskActionParamsSchema = () =>
  moduleActionParamsSchema().keys({
    task: taskSchema(),
  })

export const runBaseParams = () => ({
  interactive: joi.boolean().description("Whether to run the module interactively (i.e. attach to the terminal)."),
  runtimeContext: runtimeContextSchema(),
  silent: joi.boolean().description("Set to false if the output should not be logged to the console."),
  timeout: joi.number().optional().description("If set, how long to run the command before timing out."),
})

// TODO: update this schema in 0.13
export interface RunResult {
  // FIXME: this field can always be inferred
  moduleName: string
  // FIXME: this field is overly specific, consider replacing with more generic metadata field(s)
  command: string[]
  // FIXME: this field can always be inferred
  version: string
  success: boolean
  exitCode?: number
  // FIXME: we should avoid native Date objects
  startedAt: Date
  completedAt: Date
  log: string
  namespaceStatus?: NamespaceStatus
}

export const runResultSchema = () =>
  joi
    .object()
    .unknown(true)
    .keys({
      moduleName: joi.string().description("The name of the module that was run."),
      command: joi
        .array()
        .items(joi.string().allow(""))
        .required()
        .description("The command that was run in the module."),
      version: joi.string().description("The string version of the module."),
      success: joi.boolean().required().description("Whether the module was successfully run."),
      exitCode: joi.number().integer().description("The exit code of the run (if applicable)."),
      startedAt: joi.date().required().description("When the module run was started."),
      completedAt: joi.date().required().description("When the module run was completed."),
      log: joi.string().allow("").default("").description("The output log from the run."),
      namespaceStatus: namespaceStatusSchema().optional(),
    })

export const artifactsPathSchema = () =>
  joi.string().required().description("A directory path where the handler should write any exported artifacts to.")

export type RunState = "outdated" | "running" | "succeeded" | "failed" | "not-implemented"

export interface RunStatus {
  state: RunState
  startedAt?: Date
  completedAt?: Date
}

export function runStatus<R extends RunResult>(result: R | null | undefined): RunStatus {
  if (result) {
    const { startedAt, completedAt } = result
    return {
      startedAt,
      completedAt,
      state: result.success ? "succeeded" : "failed",
    }
  } else {
    return { state: result === null ? "outdated" : "not-implemented" }
  }
}
