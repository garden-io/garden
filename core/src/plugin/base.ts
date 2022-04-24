/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../logger/log-entry"
import { PluginContext, pluginContextSchema, PluginEventBroker } from "../plugin-context"
import { GardenModule, moduleSchema } from "../types/module"
import { RuntimeContext, runtimeContextSchema } from "../runtime-context"
import { GardenService, serviceSchema } from "../types/service"
import { GardenTask, taskSchema } from "../types/task"
import { CustomObjectSchema, joi, joiIdentifier } from "../config/common"
import { dedent, deline } from "../util/string"
import { BuildActionConfig, BuildAction } from "../actions/build"
import { DeployActionConfig, DeployAction } from "../actions/deploy"
import { RunActionConfig, RunAction } from "../actions/run"
import { TestActionConfig, TestAction } from "../actions/test"

export interface ActionHandlerParamsBase {
  base?: ActionHandler<any, any>
}

export type ActionHandler<P extends ActionHandlerParamsBase, O> = ((params: P) => Promise<O>) & {
  actionType?: string
  pluginName?: string
  base?: ActionHandler<P, O>
}

export type WrappedActionHandler<P extends ActionHandlerParamsBase, O> = ActionHandler<P, O> & {
  actionType: string
  pluginName: string
}

export interface PluginActionContextParams extends ActionHandlerParamsBase {
  ctx: PluginContext
}

export interface PluginActionParamsBase extends PluginActionContextParams {
  events?: PluginEventBroker
  log: LogEntry
}

export interface ResolvedActionHandlerDescription {
  description: string
  required?: boolean
  // TODO: specify the schemas using primitives and not Joi objects
  paramsSchema: CustomObjectSchema
  resultSchema: CustomObjectSchema
}

export interface ResolvedActionHandlerDescriptions {
  [actionName: string]: ResolvedActionHandlerDescription
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
    // TODO: specify the action wrapper class further
    action: joi.object().required(),
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

export interface PluginBuildActionParamsBase<T extends BuildActionConfig = BuildActionConfig>
  extends PluginActionParamsBase {
  action: BuildAction<T>
}

export interface PluginDeployActionParamsBase<T extends DeployActionConfig = DeployActionConfig>
  extends PluginActionParamsBase {
  action: DeployAction<T>
}

export interface PluginRunActionParamsBase<T extends RunActionConfig = RunActionConfig> extends PluginActionParamsBase {
  action: RunAction<T>
}

export interface PluginTestActionParamsBase<T extends TestActionConfig = TestActionConfig>
  extends PluginActionParamsBase {
  action: TestAction<T>
}

/**
 * START LEGACY
 */
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
/**
 * END LEGACY
 */

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
        .sparseArray()
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

export const outputSchemaDocs = dedent`
  The schema must be a single level object, with string keys. Each value must be a primitive (null, boolean, number or string).

  If no schema is provided, an error may be thrown if a plugin handler attempts to return an output key.

  If the module type has a \`base\`, you must either omit this field to inherit the base's schema, make sure that the specified schema is a _superset_ of the base's schema (i.e. only adds or further constrains existing fields), _or_ override the necessary handlers to make sure their output matches the base's schemas. This is to ensure that plugin handlers made for the base type also work with this type.
`
