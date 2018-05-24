/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { TreeVersion } from "../../vcs/base"
import {
  joiArray,
  PrimitiveMap,
} from "../common"
import {
  Module,
  moduleConfigSchema,
} from "../module"
import {
  serviceConfigSchema,
  ServiceStatus,
} from "../service"
import { testConfigSchema } from "../test"

export interface EnvironmentStatus {
  configured: boolean
  detail?: any
}

export const environmentStatusSchema = Joi.object().keys({
  configured: Joi.boolean().required(),
  detail: Joi.object(),
})

export type EnvironmentStatusMap = {
  [key: string]: EnvironmentStatus,
}

export interface ConfigureEnvironmentResult { }

export const configureEnvironmentResultSchema = Joi.object().keys({})

export interface DestroyEnvironmentResult { }

export const destroyEnvironmentResultSchema = Joi.object().keys({})

export interface GetConfigResult {
  value: string | null
}

export const getConfigResultSchema = Joi.object().keys({
  value: Joi.string().allow(null).required(),
})

export interface SetConfigResult { }

export const setConfigResultSchema = Joi.object().keys({})

export interface DeleteConfigResult {
  found: boolean
}

export const deleteConfigResultSchema = Joi.object().keys({
  found: Joi.boolean().required(),
})

export interface LoginStatus {
  loggedIn: boolean
}

export const loginStatusSchema = Joi.object().keys({
  loggedIn: Joi.boolean().required(),
})

export interface LoginStatusMap {
  [key: string]: LoginStatus,
}

export interface ExecInServiceResult {
  code: number
  output: string
  stdout?: string
  stderr?: string
}

export const execInServiceResultSchema = Joi.object().keys({
  code: Joi.number().required(),
  output: Joi.string().required(),
  stdout: Joi.string(),
  stderr: Joi.string(),
})

export interface ServiceLogEntry {
  serviceName: string
  timestamp: Date
  msg: string
}

export const serviceLogEntrySchema = Joi.object().keys({
  serviceName: Joi.string().required(),
  timestamp: Joi.date().required(),
  msg: Joi.string().required(),
})

export interface GetServiceLogsResult { }

export const getServiceLogsResultSchema = Joi.object().keys({})

export interface ParseModuleResult<T extends Module = Module> {
  module: T["config"]
  services: T["services"]
  tests: T["tests"]
}

export const parseModuleResultSchema = Joi.object().keys({
  module: moduleConfigSchema.required(),
  services: joiArray(serviceConfigSchema).required(),
  tests: joiArray(testConfigSchema).required(),
})

export interface BuildResult {
  buildLog?: string
  fetched?: boolean
  fresh?: boolean
  version?: string
  details?: any
}

export const buildModuleResultSchema = Joi.object().keys({
  buildLog: Joi.string(),
  fetched: Joi.boolean(),
  fresh: Joi.boolean(),
  version: Joi.string(),
  details: Joi.object(),
})

export interface PushResult {
  pushed: boolean
  message?: string
}

export const pushModuleResultSchema = Joi.object().keys({
  pushed: Joi.boolean().required(),
  message: Joi.string(),
})

export interface RunResult {
  moduleName: string
  command: string[]
  version: TreeVersion
  success: boolean
  startedAt: Date
  completedAt: Date
  output: string
}

export const treeVersionSchema = Joi.object().keys({
  versionString: Joi.string().required(),
  latestCommit: Joi.string().required(),
  dirtyTimestamp: Joi.number().allow(null).required(),
})

export const runResultSchema = Joi.object().keys({
  moduleName: Joi.string(),
  command: Joi.array().items(Joi.string()).required(),
  version: treeVersionSchema,
  success: Joi.boolean().required(),
  startedAt: Joi.date().required(),
  completedAt: Joi.date().required(),
  output: Joi.string().required(),
})

export interface TestResult extends RunResult {
  testName: string
}

export const testResultSchema = runResultSchema.keys({
  testName: Joi.string().required(),
})

export const getTestResultSchema = testResultSchema.allow(null)

export interface BuildStatus {
  ready: boolean
}

export const buildStatusSchema = Joi.object().keys({
  ready: Joi.boolean().required(),
})

export interface PluginActionOutputs {
  getEnvironmentStatus: Promise<EnvironmentStatus>
  configureEnvironment: Promise<ConfigureEnvironmentResult>
  destroyEnvironment: Promise<DestroyEnvironmentResult>

  getConfig: Promise<GetConfigResult>
  setConfig: Promise<SetConfigResult>
  deleteConfig: Promise<DeleteConfigResult>

  getLoginStatus: Promise<LoginStatus>
  login: Promise<LoginStatus>
  logout: Promise<LoginStatus>
}

export interface ServiceActionOutputs {
  getServiceStatus: Promise<ServiceStatus>
  deployService: Promise<ServiceStatus>
  getServiceOutputs: Promise<PrimitiveMap>
  execInService: Promise<ExecInServiceResult>
  getServiceLogs: Promise<{}>
  runService: Promise<RunResult>
}

export interface ModuleActionOutputs extends ServiceActionOutputs {
  parseModule: Promise<ParseModuleResult>
  getModuleBuildStatus: Promise<BuildStatus>
  buildModule: Promise<BuildResult>
  pushModule: Promise<PushResult>
  runModule: Promise<RunResult>
  testModule: Promise<TestResult>
  getTestResult: Promise<TestResult | null>
}
