/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import Stream from "ts-stream"
import { LogEntry } from "../../logger/log-entry"
import { PluginContext, pluginContextSchema } from "../../plugin-context"
import { ModuleVersion, moduleVersionSchema } from "../../vcs/vcs"
import { Primitive, joiPrimitive, joiArray } from "../../config/common"
import { Module, moduleSchema } from "../module"
import { RuntimeContext, Service, serviceSchema, runtimeContextSchema } from "../service"
import { Task } from "../task"
import { EnvironmentStatus, ServiceLogEntry, environmentStatusSchema } from "./outputs"
import { baseModuleSpecSchema } from "../../config/module"
import { testConfigSchema } from "../../config/test"
import { taskSchema } from "../../config/task"
import { ProviderConfig, projectNameSchema, providerConfigBaseSchema } from "../../config/project"
import { deline } from "../../util/string"

export interface PluginActionContextParams {
  ctx: PluginContext
}

export interface PluginActionParamsBase extends PluginActionContextParams {
  log: LogEntry
}

// Note: not specifying this further because we will later remove it from the API
const logEntrySchema = Joi.object()
  .description("Logging context handler that the handler can use to log messages and progress.")
  .required()

const actionParamsSchema = Joi.object()
  .keys({
    ctx: pluginContextSchema
      .required(),
    log: logEntrySchema,
  })

export interface PluginModuleActionParamsBase<T extends Module = Module> extends PluginActionParamsBase {
  module: T
}
const moduleActionParamsSchema = actionParamsSchema
  .keys({
    module: moduleSchema,
  })

export interface PluginServiceActionParamsBase<M extends Module = Module, S extends Module = Module>
  extends PluginModuleActionParamsBase<M> {
  runtimeContext?: RuntimeContext
  service: Service<M, S>
}
const serviceActionParamsSchema = moduleActionParamsSchema
  .keys({
    runtimeContext: runtimeContextSchema
      .optional(),
    service: serviceSchema,
  })

export interface PluginTaskActionParamsBase<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  task: Task<T>
}
const taskActionParamsSchema = moduleActionParamsSchema
  .keys({
    task: taskSchema,
  })

/**
 * Plugin actions
 */
export interface ConfigureProviderParams<T extends ProviderConfig = any> {
  config: T
  log: LogEntry
  projectName: string
}
export const configureProviderParamsSchema = Joi.object()
  .keys({
    config: providerConfigBaseSchema.required(),
    log: logEntrySchema,
    projectName: projectNameSchema,
  })

export interface GetEnvironmentStatusParams extends PluginActionParamsBase { }
export const getEnvironmentStatusParamsSchema = actionParamsSchema

export interface PrepareEnvironmentParams extends PluginActionParamsBase {
  status: EnvironmentStatus
  force: boolean
}
export const prepareEnvironmentParamsSchema = actionParamsSchema
  .keys({
    status: environmentStatusSchema,
    force: Joi.boolean()
      .description("Force re-configuration of the environment."),
  })

export interface CleanupEnvironmentParams extends PluginActionParamsBase {
}
export const cleanupEnvironmentParamsSchema = actionParamsSchema

export interface GetSecretParams extends PluginActionParamsBase {
  key: string
}
export const getSecretParamsSchema = actionParamsSchema
  .keys({
    key: Joi.string()
      .description("A unique identifier for the secret."),
  })

export interface SetSecretParams extends PluginActionParamsBase {
  key: string
  value: Primitive
}
export const setSecretParamsSchema = getSecretParamsSchema
  .keys({
    value: joiPrimitive()
      .description("The value of the secret."),
  })

export interface DeleteSecretParams extends PluginActionParamsBase {
  key: string
}
export const deleteSecretParamsSchema = getSecretParamsSchema

export interface PluginActionParams {
  configureProvider: ConfigureProviderParams

  getEnvironmentStatus: GetEnvironmentStatusParams
  prepareEnvironment: PrepareEnvironmentParams
  cleanupEnvironment: CleanupEnvironmentParams

  getSecret: GetSecretParams
  setSecret: SetSecretParams
  deleteSecret: DeleteSecretParams
}

/**
 * Module actions
 */
export interface DescribeModuleTypeParams { }
export const describeModuleTypeParamsSchema = Joi.object()
  .keys({})

export interface ConfigureModuleParams<T extends Module = Module> {
  ctx: PluginContext
  log: LogEntry
  moduleConfig: T["_ConfigType"]
}
export const configureModuleParamsSchema = Joi.object()
  .keys({
    ctx: pluginContextSchema
      .required(),
    log: logEntrySchema,
    moduleConfig: baseModuleSpecSchema
      .required(),
  })

export interface GetBuildStatusParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> { }
export const getBuildStatusParamsSchema = moduleActionParamsSchema

export interface BuildModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> { }
export const buildModuleParamsSchema = moduleActionParamsSchema

export interface PublishModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> { }
export const publishModuleParamsSchema = moduleActionParamsSchema

export interface RunModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  command: string[]
  interactive: boolean
  runtimeContext: RuntimeContext
  ignoreError?: boolean
  timeout?: number
}
const runBaseParams = {
  interactive: Joi.boolean()
    .description("Whether to run the module interactively (i.e. attach to the terminal)."),
  runtimeContext: runtimeContextSchema,
  silent: Joi.boolean()
    .description("Set to false if the output should not be logged to the console."),
  timeout: Joi.number()
    .optional()
    .description("If set, how long to run the command before timing out."),
}
const runModuleBaseSchema = moduleActionParamsSchema
  .keys(runBaseParams)
export const runModuleParamsSchema = runModuleBaseSchema
  .keys({
    command: joiArray(Joi.string())
      .description("The command to run in the module."),
  })

export const testVersionSchema = moduleVersionSchema
  .description(deline`
    The test run's version. In addition to the parent module's version, this also
    factors in the module versions of the test's runtime dependencies (if any).`)

export interface TestModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  interactive: boolean
  runtimeContext: RuntimeContext
  silent: boolean
  testConfig: T["testConfigs"][0]
  testVersion: ModuleVersion
}
export const testModuleParamsSchema = runModuleBaseSchema
  .keys({ testConfig: testConfigSchema, testVersion: testVersionSchema })

export interface GetTestResultParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  testName: string
  testVersion: ModuleVersion
}
export const getTestResultParamsSchema = moduleActionParamsSchema
  .keys({
    testName: Joi.string()
      .description("A unique name to identify the test run."),
    testVersion: testVersionSchema,
  })

/**
 * Service actions
 */

export type hotReloadStatus = "enabled" | "disabled"

export interface GetServiceStatusParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  hotReload: boolean,
  runtimeContext: RuntimeContext
}

export const getServiceStatusParamsSchema = serviceActionParamsSchema
  .keys({
    runtimeContext: runtimeContextSchema,
    hotReload: Joi.boolean()
      .default(false)
      .description("Whether the service should be configured for hot-reloading."),
  })

export interface DeployServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  force: boolean,
  hotReload: boolean,
  runtimeContext: RuntimeContext
}
export const deployServiceParamsSchema = serviceActionParamsSchema
  .keys({
    force: Joi.boolean()
      .description("Whether to force a re-deploy, even if the service is already deployed."),
    runtimeContext: runtimeContextSchema,
    hotReload: Joi.boolean()
      .default(false)
      .description("Whether to configure the service for hot-reloading."),
  })

export interface HotReloadServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  runtimeContext: RuntimeContext
}
export const hotReloadServiceParamsSchema = serviceActionParamsSchema
  .keys({ runtimeContext: runtimeContextSchema })

export interface DeleteServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  runtimeContext: RuntimeContext
}
export const deleteServiceParamsSchema = serviceActionParamsSchema
  .keys({
    runtimeContext: runtimeContextSchema,
  })

export interface ExecInServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  command: string[]
  runtimeContext: RuntimeContext
  interactive: boolean
}
export const execInServiceParamsSchema = serviceActionParamsSchema
  .keys({
    command: joiArray(Joi.string())
      .description("The command to run alongside the service."),
    runtimeContext: runtimeContextSchema,
    interactive: Joi.boolean(),
  })

export interface GetServiceLogsParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  runtimeContext: RuntimeContext
  stream: Stream<ServiceLogEntry>
  follow: boolean
  tail: number
  startTime?: Date
}
export const getServiceLogsParamsSchema = serviceActionParamsSchema
  .keys({
    runtimeContext: runtimeContextSchema,
    stream: Joi.object()
      .description("A Stream object, to write the logs to."),
    follow: Joi.boolean()
      .description("Whether to keep listening for logs until aborted."),
    tail: Joi.number()
      .description("Number of lines to get from end of log. Defaults to -1, showing all log lines.")
      .default(-1),
    startTime: Joi.date()
      .optional()
      .description("If set, only return logs that are as new or newer than this date."),
  })

export interface RunServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  interactive: boolean
  runtimeContext: RuntimeContext
  timeout?: number
}
export const runServiceParamsSchema = serviceActionParamsSchema
  .keys(runBaseParams)

/**
 * Task actions
 */

export const taskVersionSchema = moduleVersionSchema
  .description(deline`
    The task run's version. In addition to the parent module's version, this also
    factors in the module versions of the tasks's runtime dependencies (if any).`)

export interface GetTaskResultParams<T extends Module = Module> extends PluginTaskActionParamsBase<T> {
  taskVersion: ModuleVersion
}
export const getTaskResultParamsSchema = taskActionParamsSchema
  .keys({ taskVersion: taskVersionSchema })

export interface RunTaskParams<T extends Module = Module> extends PluginTaskActionParamsBase<T> {
  interactive: boolean
  runtimeContext: RuntimeContext
  taskVersion: ModuleVersion
  timeout?: number
}
export const runTaskParamsSchema = taskActionParamsSchema
  .keys(runBaseParams)
  .keys({ taskVersion: taskVersionSchema })

export interface ServiceActionParams<T extends Module = Module> {
  getServiceStatus: GetServiceStatusParams<T>
  deployService: DeployServiceParams<T>
  hotReloadService: HotReloadServiceParams<T>
  deleteService: DeleteServiceParams<T>
  execInService: ExecInServiceParams<T>
  getServiceLogs: GetServiceLogsParams<T>
  runService: RunServiceParams<T>
}

export interface TaskActionParams<T extends Module = Module> {
  getTaskResult: GetTaskResultParams<T>
  runTask: RunTaskParams<T>
}

export interface ModuleActionParams<T extends Module = Module> {
  describeType: DescribeModuleTypeParams,
  configure: ConfigureModuleParams<T>
  getBuildStatus: GetBuildStatusParams<T>
  build: BuildModuleParams<T>
  publishModule: PublishModuleParams<T>
  runModule: RunModuleParams<T>
  testModule: TestModuleParams<T>
  getTestResult: GetTestResultParams<T>
}
