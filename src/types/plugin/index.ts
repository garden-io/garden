/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { mapValues } from "lodash"
import {
  DeepPrimitiveMap,
  joiIdentifier,
  joiIdentifierMap,
  PrimitiveMap,
} from "../common"
import { Module } from "../module"
import {
  serviceOutputsSchema,
  serviceStatusSchema,
} from "../service"
import {
  buildModuleResultSchema,
  buildStatusSchema,
  configureEnvironmentResultSchema,
  deleteConfigResultSchema,
  destroyEnvironmentResultSchema,
  environmentStatusSchema,
  execInServiceResultSchema,
  getConfigResultSchema,
  getServiceLogsResultSchema,
  getTestResultSchema,
  loginStatusSchema,
  ModuleActionOutputs,
  parseModuleResultSchema,
  PluginActionOutputs,
  pushModuleResultSchema,
  runResultSchema,
  ServiceActionOutputs,
  setConfigResultSchema,
  testResultSchema,
} from "./outputs"
import {
  ModuleActionParams,
  PluginActionParams,
  ServiceActionParams,
} from "./params"

export interface Provider<T extends PrimitiveMap = any> extends DeepPrimitiveMap {
  name: string
  config: T
}

export type PluginActions = {
  [P in keyof PluginActionParams]: (params: PluginActionParams[P]) => PluginActionOutputs[P]
}

export type ServiceActions<T extends Module = Module> = {
  [P in keyof ServiceActionParams<T>]: (params: ServiceActionParams<T>[P]) => ServiceActionOutputs[P]
}

export type ModuleActions<T extends Module = Module> = {
  [P in keyof ModuleActionParams<T>]: (params: ModuleActionParams<T>[P]) => ModuleActionOutputs[P]
}

export type PluginActionName = keyof PluginActions
export type ServiceActionName = keyof ServiceActions
export type ModuleActionName = keyof ModuleActions

export interface PluginActionDescription {
  description?: string
  resultSchema: Joi.Schema,
}

export const pluginActionDescriptions: { [P in PluginActionName]: PluginActionDescription } = {
  getEnvironmentStatus: {
    resultSchema: environmentStatusSchema,
  },
  configureEnvironment: {
    resultSchema: configureEnvironmentResultSchema,
  },
  destroyEnvironment: {
    resultSchema: destroyEnvironmentResultSchema,
  },

  getConfig: {
    resultSchema: getConfigResultSchema,
  },
  setConfig: {
    resultSchema: setConfigResultSchema,
  },
  deleteConfig: {
    resultSchema: deleteConfigResultSchema,
  },

  getLoginStatus: {
    resultSchema: loginStatusSchema,
  },
  login: {
    resultSchema: loginStatusSchema,
  },
  logout: {
    resultSchema: loginStatusSchema,
  },
}

export const serviceActionDescriptions: { [P in ServiceActionName]: PluginActionDescription } = {
  getServiceStatus: {
    resultSchema: serviceStatusSchema,
  },
  deployService: {
    resultSchema: serviceStatusSchema,
  },
  getServiceOutputs: {
    resultSchema: serviceOutputsSchema,
  },
  execInService: {
    resultSchema: execInServiceResultSchema,
  },
  getServiceLogs: {
    resultSchema: getServiceLogsResultSchema,
  },
  runService: {
    resultSchema: runResultSchema,
  },
}

export const moduleActionDescriptions: { [P in ModuleActionName]: PluginActionDescription } = {
  parseModule: {
    resultSchema: parseModuleResultSchema,
  },
  getModuleBuildStatus: {
    resultSchema: buildStatusSchema,
  },
  buildModule: {
    resultSchema: buildModuleResultSchema,
  },
  pushModule: {
    resultSchema: pushModuleResultSchema,
  },
  runModule: {
    resultSchema: runResultSchema,
  },
  testModule: {
    resultSchema: testResultSchema,
  },
  getTestResult: {
    resultSchema: getTestResultSchema,
  },

  ...serviceActionDescriptions,
}

export const pluginActionNames: PluginActionName[] = <PluginActionName[]>Object.keys(pluginActionDescriptions)
export const serviceActionNames: ServiceActionName[] = <ServiceActionName[]>Object.keys(serviceActionDescriptions)
export const moduleActionNames: ModuleActionName[] = <ModuleActionName[]>Object.keys(moduleActionDescriptions)

export interface GardenPlugin {
  config?: object
  configKeys?: string[]

  modules?: string[]

  actions?: Partial<PluginActions>
  moduleActions?: { [moduleType: string]: Partial<ModuleActions> }
}

export interface PluginFactory {
  ({ config: object, logEntry: LogEntry }): GardenPlugin
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
