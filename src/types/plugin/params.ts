/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Stream from "ts-stream"
import { LogEntry } from "../../logger"
import { PluginContext } from "../../plugin-context"
import { TreeVersion } from "../../vcs/base"
import {
  Environment,
  Primitive,
} from "../common"
import { Module } from "../module"
import {
  RuntimeContext,
  Service,
} from "../service"
import {
  Provider,
} from "./index"
import {
  EnvironmentStatus,
  ServiceLogEntry,
} from "./outputs"

export interface PluginActionContextParams {
  ctx: PluginContext
  env: Environment
  provider: Provider
}

export interface PluginActionParamsBase extends PluginActionContextParams {
  logEntry?: LogEntry
}

export interface PluginModuleActionParamsBase<T extends Module = Module> extends PluginActionParamsBase {
  module: T
}

export interface PluginServiceActionParamsBase<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  service: Service<T>
  runtimeContext?: RuntimeContext
}

export interface ParseModuleParams<T extends Module = Module> {
  env: Environment
  provider: Provider
  logEntry?: LogEntry
  moduleConfig: T["_ConfigType"]
}

export interface GetEnvironmentStatusParams extends PluginActionParamsBase {
}

export interface ConfigureEnvironmentParams extends PluginActionParamsBase {
  status: EnvironmentStatus
  force: boolean
}

export interface DestroyEnvironmentParams extends PluginActionParamsBase {
}

export interface GetConfigParams extends PluginActionParamsBase {
  key: string[]
}

export interface SetConfigParams extends PluginActionParamsBase {
  key: string[]
  value: Primitive
}

export interface DeleteConfigParams extends PluginActionParamsBase {
  key: string[]
}

export interface PluginActionParams {
  getEnvironmentStatus: GetEnvironmentStatusParams
  configureEnvironment: ConfigureEnvironmentParams
  destroyEnvironment: DestroyEnvironmentParams

  getConfig: GetConfigParams
  setConfig: SetConfigParams
  deleteConfig: DeleteConfigParams

  getLoginStatus: PluginActionParamsBase
  login: PluginActionParamsBase
  logout: PluginActionParamsBase
}

export interface GetModuleBuildStatusParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
}

export interface BuildModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
}

export interface PushModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
}

export interface RunModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  command: string[]
  interactive: boolean
  runtimeContext: RuntimeContext
  silent: boolean
  timeout?: number
}

export interface TestModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  interactive: boolean
  runtimeContext: RuntimeContext
  silent: boolean
  testConfig: T["tests"][0]
}

export interface GetTestResultParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  testName: string
  version: TreeVersion
}

export interface GetServiceStatusParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
}

export interface DeployServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
  runtimeContext: RuntimeContext,
  force?: boolean,
}

export interface GetServiceOutputsParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
}

export interface ExecInServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
  command: string[],
}

export interface GetServiceLogsParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
  stream: Stream<ServiceLogEntry>,
  tail?: boolean,
  startTime?: Date,
}

export interface RunServiceParams<T extends Module = Module> extends PluginServiceActionParamsBase<T> {
  interactive: boolean
  runtimeContext: RuntimeContext
  silent: boolean
  timeout?: number
}

export interface ServiceActionParams<T extends Module = Module> {
  getServiceStatus: GetServiceStatusParams<T>
  deployService: DeployServiceParams<T>
  getServiceOutputs: GetServiceOutputsParams<T>
  execInService: ExecInServiceParams<T>
  getServiceLogs: GetServiceLogsParams<T>
  runService: RunServiceParams<T>
}

export interface ModuleActionParams<T extends Module = Module> extends ServiceActionParams {
  parseModule: ParseModuleParams<T>
  getModuleBuildStatus: GetModuleBuildStatusParams<T>
  buildModule: BuildModuleParams<T>
  pushModule: PushModuleParams<T>
  runModule: RunModuleParams<T>
  testModule: TestModuleParams<T>
  getTestResult: GetTestResultParams<T>
}
