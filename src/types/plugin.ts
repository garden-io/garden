/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { PluginContext } from "../plugin-context"
import { Module, TestSpec } from "./module"
import {
  Environment,
  joiIdentifier,
  joiIdentifierMap,
  Primitive,
  PrimitiveMap,
} from "./common"
import { Service, ServiceContext, ServiceStatus } from "./service"
import { LogEntry } from "../logger"
import { Stream } from "ts-stream"
import { Moment } from "moment"
import { TreeVersion } from "../vcs/base"
import { mapValues } from "lodash"

// TODO: split this module up

export interface Provider<T extends object = any> {
  name: string
  config: T
}

export interface PluginActionParamsBase {
  ctx: PluginContext
  provider: Provider
  logEntry?: LogEntry
}

export interface ParseModuleParams<T extends Module = Module> extends PluginActionParamsBase {
  moduleConfig: T["_ConfigType"]
}

export interface GetEnvironmentStatusParams extends PluginActionParamsBase {
  env: Environment,
}

export interface ConfigureEnvironmentParams extends PluginActionParamsBase {
  env: Environment
  status: EnvironmentStatus
}

export interface DestroyEnvironmentParams extends PluginActionParamsBase {
  env: Environment,
}

export interface GetConfigParams extends PluginActionParamsBase {
  env: Environment,
  key: string[]
}

export interface SetConfigParams extends PluginActionParamsBase {
  env: Environment,
  key: string[]
  value: Primitive
}

export interface DeleteConfigParams extends PluginActionParamsBase {
  env: Environment,
  key: string[]
}

export interface PluginActionParams {
  getEnvironmentStatus: GetEnvironmentStatusParams
  configureEnvironment: ConfigureEnvironmentParams
  destroyEnvironment: DestroyEnvironmentParams

  getConfig: GetConfigParams
  setConfig: SetConfigParams
  deleteConfig: DeleteConfigParams
}

export interface GetModuleBuildStatusParams<T extends Module = Module> extends PluginActionParamsBase {
  module: T
}

export interface BuildModuleParams<T extends Module = Module> extends PluginActionParamsBase {
  module: T
  buildContext: PrimitiveMap
}

export interface PushModuleParams<T extends Module = Module> extends PluginActionParamsBase {
  module: T
}

export interface TestModuleParams<T extends Module = Module> extends PluginActionParamsBase {
  module: T
  testSpec: TestSpec,
  env: Environment,
}

export interface GetTestResultParams<T extends Module = Module> extends PluginActionParamsBase {
  module: T,
  version: TreeVersion,
  env: Environment,
}

export interface GetServiceStatusParams<T extends Module = Module> extends PluginActionParamsBase {
  service: Service<T>,
  env: Environment,
}

export interface DeployServiceParams<T extends Module = Module> extends PluginActionParamsBase {
  service: Service<T>,
  serviceContext: ServiceContext,
  env: Environment,
}

export interface GetServiceOutputsParams<T extends Module = Module> extends PluginActionParamsBase {
  service: Service<T>,
  env: Environment,
}

export interface ExecInServiceParams<T extends Module = Module> extends PluginActionParamsBase {
  service: Service<T>,
  env: Environment,
  command: string[],
}

export interface GetServiceLogsParams<T extends Module = Module> extends PluginActionParamsBase {
  service: Service<T>,
  env: Environment,
  stream: Stream<ServiceLogEntry>,
  tail?: boolean,
  startTime?: Date,
}

export interface ModuleActionParams<T extends Module = Module> {
  parseModule: ParseModuleParams<T>
  getModuleBuildStatus: GetModuleBuildStatusParams<T>
  buildModule: BuildModuleParams<T>
  pushModule: PushModuleParams<T>
  testModule: TestModuleParams<T>
  getTestResult: GetTestResultParams<T>

  getServiceStatus: GetServiceStatusParams<T>
  deployService: DeployServiceParams<T>
  getServiceOutputs: GetServiceOutputsParams<T>
  execInService: ExecInServiceParams<T>
  getServiceLogs: GetServiceLogsParams<T>
}

export interface BuildResult {
  buildLog?: string
  fetched?: boolean
  fresh?: boolean
  version?: string
  details?: any
}

export interface PushResult {
  pushed: boolean
  message?: string
}

export interface TestResult {
  version: TreeVersion
  success: boolean
  startedAt: Moment | Date
  completedAt: Moment | Date
  output: string
}

export interface BuildStatus {
  ready: boolean
}

export interface EnvironmentStatus {
  configured: boolean
  detail?: any
}

export type EnvironmentStatusMap = {
  [key: string]: EnvironmentStatus,
}

export interface ExecInServiceResult {
  code: number
  output: string
  stdout?: string
  stderr?: string
}

export interface ServiceLogEntry {
  serviceName: string
  timestamp: Moment | Date
  msg: string
}

export interface DeleteConfigResult {
  found: boolean
}

export interface PluginActionOutputs {
  getEnvironmentStatus: Promise<EnvironmentStatus>
  configureEnvironment: Promise<void>
  destroyEnvironment: Promise<void>

  getConfig: Promise<string | null>
  setConfig: Promise<void>
  deleteConfig: Promise<DeleteConfigResult>
}

export interface ModuleActionOutputs<T extends Module = Module> {
  parseModule: Promise<T>
  getModuleBuildStatus: Promise<BuildStatus>
  buildModule: Promise<BuildResult>
  pushModule: Promise<PushResult>
  testModule: Promise<TestResult>
  getTestResult: Promise<TestResult | null>

  getServiceStatus: Promise<ServiceStatus>
  deployService: Promise<any>   // TODO: specify
  getServiceOutputs: Promise<PrimitiveMap>
  execInService: Promise<ExecInServiceResult>
  getServiceLogs: Promise<void>
}

export type PluginActions = {
  [P in keyof PluginActionParams]: (params: PluginActionParams[P]) => PluginActionOutputs[P]
}

export type ModuleActions<T extends Module> = {
  [P in keyof ModuleActionParams<T>]: (params: ModuleActionParams<T>[P]) => ModuleActionOutputs<T>[P]
}

export type PluginActionName = keyof PluginActions
export type ModuleActionName = keyof ModuleActions<any>

interface PluginActionDescription {
  description?: string
}

const pluginActionDescriptions: { [P in PluginActionName]: PluginActionDescription } = {
  getEnvironmentStatus: {},
  configureEnvironment: {},
  destroyEnvironment: {},

  getConfig: {},
  setConfig: {},
  deleteConfig: {},
}

const moduleActionDescriptions: { [P in ModuleActionName]: PluginActionDescription } = {
  parseModule: {},
  getModuleBuildStatus: {},
  buildModule: {},
  pushModule: {},
  testModule: {},
  getTestResult: {},

  getServiceStatus: {},
  deployService: {},
  getServiceOutputs: {},
  execInService: {},
  getServiceLogs: {},
}

export const pluginActionNames: PluginActionName[] = <PluginActionName[]>Object.keys(pluginActionDescriptions)
export const moduleActionNames: ModuleActionName[] = <ModuleActionName[]>Object.keys(moduleActionDescriptions)

export interface GardenPlugin {
  config?: object
  configKeys?: string[]

  modules?: string[]

  actions?: Partial<PluginActions>
  moduleActions?: { [moduleType: string]: Partial<ModuleActions<any>> }
}

export interface PluginFactory {
  ({ garden: Garden, config: object }): GardenPlugin
  pluginName?: string
}
export type RegisterPluginParam = string | PluginFactory

export const pluginSchema = Joi.object().keys({
  config: Joi.object(),
  modules: Joi.array().items(Joi.string()),
  actions: Joi.object().keys(mapValues(pluginActionDescriptions, () => Joi.func())),
  moduleActions: joiIdentifierMap(
    Joi.object().keys(mapValues(moduleActionDescriptions, () => Joi.func())),
  ),
})

export const pluginModuleSchema = Joi.object().keys({
  name: joiIdentifier(),
  gardenPlugin: Joi.func().required(),
}).unknown(true)
