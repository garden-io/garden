/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from "../garden"
import { PluginContext } from "../plugin-context"
import { Module, TestSpec } from "./module"
import { Environment, Primitive, PrimitiveMap } from "./common"
import { Nullable } from "../util"
import { Service, ServiceContext, ServiceStatus } from "./service"
import { LogEntry } from "../logger"
import { Stream } from "ts-stream"
import { Moment } from "moment"
import { TreeVersion } from "../vcs/base"

export interface PluginActionParamsBase {
  ctx: PluginContext
  logEntry?: LogEntry
}

export interface ParseModuleParams<T extends Module = Module> extends PluginActionParamsBase {
  config: T["_ConfigType"]
}

export interface GetModuleBuildStatusParams<T extends Module = Module> extends PluginActionParamsBase {
  module: T
}

export interface BuildModuleParams<T extends Module = Module> extends PluginActionParamsBase {
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

export interface GetEnvironmentStatusParams extends PluginActionParamsBase {
  env: Environment,
}

export interface ConfigureEnvironmentParams extends PluginActionParamsBase {
  env: Environment,
}

export interface DestroyEnvironmentParams extends PluginActionParamsBase {
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
  exposePorts?: boolean,
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

export interface PluginActionParams<T extends Module = Module> {
  parseModule: ParseModuleParams<T>
  getModuleBuildStatus: GetModuleBuildStatusParams<T>
  buildModule: BuildModuleParams<T>
  testModule: TestModuleParams<T>
  getTestResult: GetTestResultParams<T>

  getEnvironmentStatus: GetEnvironmentStatusParams
  configureEnvironment: ConfigureEnvironmentParams
  destroyEnvironment: DestroyEnvironmentParams

  getServiceStatus: GetServiceStatusParams<T>
  deployService: DeployServiceParams<T>
  getServiceOutputs: GetServiceOutputsParams<T>
  execInService: ExecInServiceParams<T>
  getServiceLogs: GetServiceLogsParams<T>

  getConfig: GetConfigParams
  setConfig: SetConfigParams
  deleteConfig: DeleteConfigParams
}

export interface BuildResult {
  buildLog?: string
  fetched?: boolean
  fresh?: boolean
  version?: string
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

export interface PluginActionOutputs<T extends Module = Module> {
  parseModule: Promise<T>
  getModuleBuildStatus: Promise<BuildStatus>
  buildModule: Promise<BuildResult>
  testModule: Promise<TestResult>
  getTestResult: Promise<TestResult | null>

  getEnvironmentStatus: Promise<EnvironmentStatus>
  configureEnvironment: Promise<void>
  destroyEnvironment: Promise<void>

  getServiceStatus: Promise<ServiceStatus>
  deployService: Promise<any>   // TODO: specify
  getServiceOutputs: Promise<PrimitiveMap>
  execInService: Promise<ExecInServiceResult>
  getServiceLogs: Promise<void>

  getConfig: Promise<string | null>
  setConfig: Promise<void>
  deleteConfig: Promise<DeleteConfigResult>
}

export type PluginActions<T extends Module> = {
  [P in keyof PluginActionParams<T>]: (params: PluginActionParams<T>[P]) => PluginActionOutputs<T>[P]
}

export type PluginActionName = keyof PluginActions<any>

// A little convoluted, but serves the purpose of making sure we don't forget to include actions
// in the `pluginActionNames` array
class _PluginActionKeys implements Nullable<PluginActions<Module>> {
  parseModule = null
  getModuleBuildStatus = null
  buildModule = null
  testModule = null
  getTestResult = null

  getEnvironmentStatus = null
  configureEnvironment = null
  destroyEnvironment = null
  getServiceStatus = null
  deployService = null
  getServiceOutputs = null
  execInService = null
  getServiceLogs = null

  getConfig = null
  setConfig = null
  deleteConfig = null
}

export const pluginActionNames: PluginActionName[] =
  <PluginActionName[]>Object.keys(new _PluginActionKeys())

export interface Plugin<T extends Module> extends Partial<PluginActions<T>> {
  name: string

  // Specify which module types are applicable to the module actions
  supportedModuleTypes: string[]

  configKeys?: string[]
}

export type PluginFactory = (garden: Garden) => Plugin<any>
