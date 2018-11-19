/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten, uniq } from "lodash"
import { getNames } from "../util/util"
import { TestSpec } from "../config/test"
import { ModuleSpec, ModuleConfig, moduleConfigSchema } from "../config/module"
import { ServiceSpec } from "../config/service"
import { Task, taskFromConfig } from "./task"
import { TaskSpec, taskSchema } from "../config/task"
import { ModuleVersion, moduleVersionSchema } from "../vcs/base"
import { pathToCacheContext } from "../cache"
import { Garden } from "../garden"
import { serviceFromConfig, Service, serviceSchema } from "./service"
import * as Joi from "joi"
import { joiArray, joiIdentifier } from "../config/common"

export interface BuildCopySpec {
  source: string
  target: string
}

export interface Module<
  M extends ModuleSpec = any,
  S extends ServiceSpec = any,
  T extends TestSpec = any,
  W extends TaskSpec = any,
  > extends ModuleConfig<M, S, T, W> {
  buildPath: string
  version: ModuleVersion

  services: Service<Module<M, S, T, W>>[]
  serviceNames: string[]
  serviceDependencyNames: string[]

  tasks: Task<Module<M, S, T, W>>[]
  taskNames: string[]
  taskDependencyNames: string[]

  _ConfigType: ModuleConfig<M, S, T, W>
}

export const moduleSchema = moduleConfigSchema
  .keys({
    buildPath: Joi.string()
      .required()
      .uri(<any>{ relativeOnly: true })
      .description("The path to the build staging directory for the module."),
    version: moduleVersionSchema
      .required(),
    services: joiArray(Joi.lazy(() => serviceSchema))
      .required()
      .description("A list of all the services that the module provides."),
    serviceNames: joiArray(joiIdentifier())
      .required()
      .description("The names of the services that the module provides."),
    serviceDependencyNames: joiArray(joiIdentifier())
      .required()
      .description("The names of all the services and tasks that the services in this module depend on."),
    tasks: joiArray(Joi.lazy(() => taskSchema))
      .required()
      .description("A list of all the tasks that the module provides."),
    taskNames: joiArray(joiIdentifier())
      .required()
      .description("The names of the tasks that the module provides."),
    taskDependencyNames: joiArray(joiIdentifier())
      .required()
      .description("The names of all the tasks and services that the tasks in this module depend on."),
  })

export interface ModuleMap<T extends Module = Module> {
  [key: string]: T
}

export interface ModuleConfigMap<T extends ModuleConfig = ModuleConfig> {
  [key: string]: T
}

export async function moduleFromConfig(garden: Garden, config: ModuleConfig): Promise<Module> {
  const module: Module = {
    ...config,

    buildPath: await garden.buildDir.buildPath(config.name),
    version: await garden.resolveVersion(config.name, config.build.dependencies),

    services: [],
    serviceNames: getNames(config.serviceConfigs),
    serviceDependencyNames: uniq(flatten(config.serviceConfigs
      .map(serviceConfig => serviceConfig.dependencies)
      .filter(deps => !!deps))),

    tasks: [],
    taskNames: getNames(config.taskConfigs),
    taskDependencyNames: uniq(flatten(config.taskConfigs
      .map(taskConfig => taskConfig.dependencies)
      .filter(deps => !!deps))),

    _ConfigType: config,
  }

  module.services = config.serviceConfigs.map(serviceConfig => serviceFromConfig(module, serviceConfig))

  module.tasks = config.taskConfigs.map(taskConfig => taskFromConfig(module, taskConfig))

  return module
}

export function getModuleCacheContext(config: ModuleConfig) {
  return pathToCacheContext(config.path)
}

export function getModuleKey(name: string, plugin?: string) {
  const hasPrefix = !!name.match(/--/)
  return (plugin && !hasPrefix) ? `${plugin}--${name}` : name
}
