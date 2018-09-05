/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Stream from "ts-stream"
import { LogEntry } from "../../logger/log-entry"
import { PluginContext, pluginContextSchema } from "../../plugin-context"
import { ModuleVersion, moduleVersionSchema } from "../../vcs/base"
import { Primitive, joiPrimitive, joiArray, joiIdentifierMap } from "../../config/common"
import { Module, moduleSchema } from "../module"
import { RuntimeContext, Service, serviceSchema, runtimeContextSchema } from "../service"
import { EnvironmentStatus, ServiceLogEntry, environmentStatusSchema } from "./outputs"
import * as Joi from "joi"
import { moduleConfigSchema } from "../../config/module"
import { testConfigSchema } from "../../config/test"

export interface PluginActionContextParams {
  ctx: PluginContext
}

export interface PluginActionParamsBase extends PluginActionContextParams {
  logEntry?: LogEntry
}

// Note: not specifying this further because we will later remove it from the API
const logEntrySchema = Joi.object()
  .description("Logging context handler that the handler can use to log messages and progress.")

const actionParamsSchema = Joi.object()
  .keys({
    ctx: pluginContextSchema
      .required(),
    logEntry: logEntrySchema,
  })

export interface PluginModuleActionParamsBase<T extends Module = Module> extends PluginActionParamsBase {
  module: T
  buildDependencies: { [name: string]: Module }
}
const moduleActionParamsSchema = actionParamsSchema
  .keys({
    module: moduleSchema,
    buildDependencies: joiIdentifierMap(moduleSchema)
      .description("All build dependencies of this module, keyed by name."),
  })

export interface PluginServiceActionParamsBase<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  runtimeContext?: RuntimeContext
  service: Service<T>
}
const serviceActionParamsSchema = moduleActionParamsSchema
  .keys({
    runtimeContext: runtimeContextSchema
      .optional(),
    service: serviceSchema,
  })

/**
 * Plugin actions
 */
export interface DescribeModuleTypeParams { }
export const describeModuleTypeParamsSchema = Joi.object()
  .keys({})

export interface ValidateModuleParams<T extends Module = Module> {
  ctx: PluginContext
  logEntry?: LogEntry
  moduleConfig: T["_ConfigType"]
}
export const validateModuleParamsSchema = Joi.object()
  .keys({
    ctx: pluginContextSchema
      .required(),
    logEntry: logEntrySchema,
    moduleConfig: moduleConfigSchema
      .required(),
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
export interface GetBuildStatusParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> { }
export const getBuildStatusParamsSchema = moduleActionParamsSchema

export interface BuildModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> { }
export const buildModuleParamsSchema = moduleActionParamsSchema

export interface PushModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> { }
export const pushModuleParamsSchema = moduleActionParamsSchema

export interface PublishModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> { }
export const publishModuleParamsSchema = moduleActionParamsSchema

export interface HotReloadParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  runtimeContext: RuntimeContext
}
export const hotReloadParamsSchema = moduleActionParamsSchema
  .keys({ runtimeContext: runtimeContextSchema })

export interface RunModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  command: string[]
  interactive: boolean
  runtimeContext: RuntimeContext
  silent: boolean
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

export interface TestModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  interactive: boolean
  runtimeContext: RuntimeContext
  silent: boolean
  testConfig: T["testConfigs"][0]
}
export const testModuleParamsSchema = runModuleBaseSchema
  .keys({
    testConfig: testConfigSchema,
  })

export interface GetTestResultParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  testName: string
  version: ModuleVersion
}
export const getTestResultParamsSchema = moduleActionParamsSchema
  .keys({
    testName: Joi.string()
      .description("A unique name to identify the test run."),
    version: moduleVersionSchema,
  })

/**
 * Service actions
 */
export interface GetServiceStatusParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
  watch?: boolean
  runtimeContext: RuntimeContext
}
export const getServiceStatusParamsSchema = serviceActionParamsSchema
  .keys({
    runtimeContext: runtimeContextSchema,
  })

export interface DeployServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
  force: boolean,
  watch?: boolean,
  runtimeContext: RuntimeContext
}
export const deployServiceParamsSchema = serviceActionParamsSchema
  .keys({
    force: Joi.boolean()
      .description("Whether to force a re-deploy, even if the service is already deployed."),
    runtimeContext: runtimeContextSchema,
  })

export interface DeleteServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
  runtimeContext: RuntimeContext
}
export const deleteServiceParamsSchema = serviceActionParamsSchema
  .keys({
    runtimeContext: runtimeContextSchema,
  })

export interface GetServiceOutputsParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> { }
export const getServiceOutputsParamsSchema = serviceActionParamsSchema

export interface ExecInServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
  command: string[]
  runtimeContext: RuntimeContext
}
export const execInServiceParamsSchema = serviceActionParamsSchema
  .keys({
    command: joiArray(Joi.string())
      .description("The command to run alongside the service."),
    runtimeContext: runtimeContextSchema,
  })

export interface GetServiceLogsParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
  runtimeContext: RuntimeContext
  stream: Stream<ServiceLogEntry>
  tail: boolean
  startTime?: Date
}
export const getServiceLogsParamsSchema = serviceActionParamsSchema
  .keys({
    runtimeContext: runtimeContextSchema,
    stream: Joi.object()
      .description("A Stream object, to write the logs to."),
    tail: Joi.boolean()
      .description("Whether to keep listening for logs until aborted."),
    startTime: Joi.date()
      .optional()
      .description("If set, only return logs that are as new or newer than this date."),
  })

export interface RunServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
  interactive: boolean
  runtimeContext: RuntimeContext
  silent: boolean
  timeout?: number
}
export const runServiceParamsSchema = serviceActionParamsSchema
  .keys(runBaseParams)

export interface ServiceActionParams<T extends Module = Module> {
  getServiceStatus: GetServiceStatusParams<T>
  deployService: DeployServiceParams<T>
  deleteService: DeleteServiceParams<T>
  getServiceOutputs: GetServiceOutputsParams<T>
  execInService: ExecInServiceParams<T>
  getServiceLogs: GetServiceLogsParams<T>
  runService: RunServiceParams<T>
}

export interface ModuleActionParams<T extends Module = Module> {
  describeType: DescribeModuleTypeParams,
  validate: ValidateModuleParams<T>
  getBuildStatus: GetBuildStatusParams<T>
  build: BuildModuleParams<T>
  pushModule: PushModuleParams<T>
  hotReload: HotReloadParams<T>
  publishModule: PublishModuleParams<T>
  runModule: RunModuleParams<T>
  testModule: TestModuleParams<T>
  getTestResult: GetTestResultParams<T>
}
