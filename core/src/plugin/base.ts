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
import { CustomObjectSchema, joi, joiIdentifier } from "../config/common"
import { dedent, deline } from "../util/string"
import { BuildAction } from "../actions/build"
import { DeployAction } from "../actions/deploy"
import { RunAction } from "../actions/run"
import { TestAction } from "../actions/test"
import { Resolved } from "../actions/base"

export interface ActionHandlerParamsBase<O = any> {
  base?: ActionHandler<any, O>
}

export type ActionHandler<P extends ActionHandlerParamsBase, O> = ((params: P) => Promise<O>) & {
  handlerType?: string
  pluginName?: string
  base?: ActionHandler<P, O>
}

export type WrappedActionHandler<P extends ActionHandlerParamsBase, O> = ActionHandler<P, O> & {
  handlerType: string
  pluginName: string
}

export interface PluginActionContextParams extends ActionHandlerParamsBase {
  ctx: PluginContext
}

export interface PluginActionParamsBase extends PluginActionContextParams {
  events?: PluginEventBroker
  log: LogEntry
}

export interface ResolvedActionHandlerDescription<N = string> {
  name: N
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

export interface PluginBuildActionParamsBase<T extends BuildAction<any, any>> extends PluginActionParamsBase {
  action: T
}

export interface PluginDeployActionParamsBase<T extends DeployAction<any, any>> extends PluginActionParamsBase {
  action: T
}

export interface PluginRunActionParamsBase<T extends RunAction<any, any>> extends PluginActionParamsBase {
  action: T
}

export interface PluginTestActionParamsBase<T extends TestAction<any, any>> extends PluginActionParamsBase {
  action: T
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
/**
 * END LEGACY
 */

export const runBaseParams = () => ({
  interactive: joi.boolean().description("Whether to run interactively (i.e. attach to the terminal)."),
  silent: joi.boolean().description("Set to false if the output should not be logged to the console."),
  timeout: joi.number().optional().description("If set, how long to run the command before timing out."),
})

// TODO-G2: update this schema in 0.13
export interface RunResult {
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

  If the module/action type has a \`base\`, you must either omit this field to inherit the base's schema, make sure that the specified schema is a _superset_ of the base's schema (i.e. only adds or further constrains existing fields), _or_ override the necessary handlers to make sure their output matches the base's schemas. This is to ensure that plugin handlers made for the base type also work with this type.
`
