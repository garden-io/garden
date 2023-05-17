/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ActionLog, Log } from "../logger/log-entry"
import { PluginContext, pluginContextSchema } from "../plugin-context"
import { createSchema, joi } from "../config/common"
import { dedent, deline } from "../util/string"
import type { BuildAction } from "../actions/build"
import type { DeployAction } from "../actions/deploy"
import type { RunAction } from "../actions/run"
import type { TestAction } from "../actions/test"
import type { NamespaceStatus } from "../types/namespace"
import type Joi from "@hapi/joi"
import { memoize } from "lodash"
import type { BaseProviderConfig, Provider } from "../config/provider"

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

export interface PluginActionContextParams<C extends BaseProviderConfig = any> extends ActionHandlerParamsBase {
  ctx: PluginContext<C>
}

export interface PluginActionParamsBase<C extends BaseProviderConfig = any> extends PluginActionContextParams<C> {
  log: Log
  provider?: Provider<C>
}

export interface ResolvedActionHandlerDescription<N = string> {
  name: N
  description: string
  required?: boolean
  // TODO: specify the schemas using primitives and not Joi objects
  paramsSchema: Joi.ObjectSchema
  resultSchema: Joi.ObjectSchema
}

export interface ResolvedActionHandlerDescriptions {
  [actionName: string]: ResolvedActionHandlerDescription
}

// Note: not specifying this further because we will later remove it from the API
export const logEntrySchema = memoize(() =>
  joi.object().description("Logging context handler that the handler can use to log messages and progress.").required()
)

export const pluginEventBrokerSchema = memoize(() =>
  joi.object().description(deline`
    Event broker that the handler can use to emit events that are handled by the action and/or command that called it.
  `)
)

// Used by actions that don't belong to a single action config (e.g. environment-, provider- or graph-level actions).
export const projectActionParamsSchema = createSchema({
  name: "project-action-params",
  keys: () => ({
    ctx: pluginContextSchema().required(),
    log: logEntrySchema(),
    events: pluginEventBrokerSchema(),
  }),
})

export const actionParamsSchema = createSchema({
  name: "action-params",
  extend: projectActionParamsSchema,
  keys: () => ({
    // TODO: specify the action wrapper class further
    action: joi.object().required(),
  }),
})

export interface PluginBuildActionParamsBase<T extends BuildAction<any, any>> extends PluginActionParamsBase {
  log: ActionLog
  action: T
}

export interface PluginDeployActionParamsBase<T extends DeployAction<any, any>> extends PluginActionParamsBase {
  log: ActionLog
  action: T
}

export interface PluginRunActionParamsBase<T extends RunAction<any, any>> extends PluginActionParamsBase {
  log: ActionLog
  action: T
}

export interface PluginTestActionParamsBase<T extends TestAction<any, any>> extends PluginActionParamsBase {
  log: ActionLog
  action: T
}

export const runBaseParams = () => ({
  interactive: joi.boolean().description("Whether to run interactively (i.e. attach to the terminal)."),
  silent: joi.boolean().description("Set to false if no output should be logged."),
  timeout: joi.number().required().description("If set, how long to run the command before timing out."),
  artifactsPath: artifactsPathSchema(),
})

// TODO-0.13.0: update this schema in 0.13.0
export interface RunResult {
  success: boolean
  exitCode?: number
  // FIXME: we should avoid native Date objects
  startedAt: Date
  completedAt: Date
  log: string
  diagnosticErrorMsg?: string
  namespaceStatus?: NamespaceStatus
}

export const runResultSchema = createSchema({
  name: "run-result",
  keys: () => ({
    success: joi.boolean().required().description("Whether the module was successfully run."),
    exitCode: joi.number().integer().description("The exit code of the run (if applicable)."),
    startedAt: joi.date().required().description("When the module run was started."),
    completedAt: joi.date().required().description("When the module run was completed."),
    log: joi.string().allow("").default("").description("The output log from the run."),
    diagnosticErrorMsg: joi
      .string()
      .optional()
      .description("An optional, more detailed diagnostic error message from the plugin."),
  }),
  allowUnknown: true,
})

export const artifactsPathSchema = memoize(() =>
  joi.string().required().description("A directory path where the handler should write any exported artifacts to.")
)

export type RunState = "outdated" | "unknown" | "running" | "succeeded" | "failed" | "not-implemented"

export interface RunStatusForEventPayload {
  state: RunState
}

export const outputSchemaDocs = dedent`
  The schema must be a single level object, with string keys. Each value must be a primitive (null, boolean, number or string).

  If no schema is provided, an error may be thrown if a plugin handler attempts to return an output key.

  If the module/action type has a \`base\`, you must either omit this field to inherit the base's schema, make sure that the specified schema is a _superset_ of the base's schema (i.e. only adds or further constrains existing fields), _or_ override the necessary handlers to make sure their output matches the base's schemas. This is to ensure that plugin handlers made for the base type also work with this type.
`
