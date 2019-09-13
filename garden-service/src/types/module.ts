/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten, uniq, cloneDeep, keyBy } from "lodash"
import { getNames } from "../util/util"
import { TestSpec } from "../config/test"
import { ModuleSpec, ModuleConfig, moduleConfigSchema } from "../config/module"
import { ServiceSpec } from "../config/service"
import { TaskSpec } from "../config/task"
import { ModuleVersion, moduleVersionSchema } from "../vcs/vcs"
import { pathToCacheContext } from "../cache"
import { Garden } from "../garden"
import { joiArray, joiIdentifier, joiIdentifierMap, joi } from "../config/common"
import { ConfigGraph } from "../config-graph"
import Bluebird from "bluebird"
import { getConfigFilePath } from "../util/fs"

export interface FileCopySpec {
  source: string
  target: string
}

/**
 * The Module interface adds several internally managed keys to the ModuleConfig type.
 */
export interface Module<
  M extends ModuleSpec = any,
  S extends ServiceSpec = any,
  T extends TestSpec = any,
  W extends TaskSpec = any,
  > extends ModuleConfig<M, S, T, W> {

  buildPath: string
  buildMetadataPath: string
  configPath: string

  version: ModuleVersion

  buildDependencies: ModuleMap

  serviceNames: string[]
  serviceDependencyNames: string[]

  taskNames: string[]
  taskDependencyNames: string[]

  _ConfigType: ModuleConfig<M, S, T, W>
}

export const moduleSchema = moduleConfigSchema
  .keys({
    buildPath: joi.string()
      .required()
      .description("The path to the build staging directory for the module."),
    buildMetadataPath: joi.string()
      .required()
      .description("The path to the build metadata directory for the module."),
    configPath: joi.string()
      .required()
      .description("The path to the module config file."),
    version: moduleVersionSchema
      .required(),
    buildDependencies: joiIdentifierMap(joi.lazy(() => moduleSchema))
      .required()
      .description("A map of all modules referenced under \`build.dependencies\`."),
    serviceNames: joiArray(joiIdentifier())
      .required()
      .description("The names of the services that the module provides."),
    serviceDependencyNames: joiArray(joiIdentifier())
      .required()
      .description("The names of all the services and tasks that the services in this module depend on."),
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

export async function moduleFromConfig(garden: Garden, graph: ConfigGraph, config: ModuleConfig): Promise<Module> {
  const configPath = await getConfigFilePath(config.path)
  const version = await garden.resolveVersion(config.name, config.build.dependencies)

  const module: Module = {
    ...cloneDeep(config),

    buildPath: await garden.buildDir.buildPath(config.name),
    buildMetadataPath: await garden.buildDir.buildMetadataPath(config.name),
    configPath,

    version,

    buildDependencies: {},

    serviceNames: getNames(config.serviceConfigs),
    serviceDependencyNames: uniq(flatten(config.serviceConfigs
      .map(serviceConfig => serviceConfig.dependencies)
      .filter(deps => !!deps))),

    taskNames: getNames(config.taskConfigs),
    taskDependencyNames: uniq(flatten(config.taskConfigs
      .map(taskConfig => taskConfig.dependencies)
      .filter(deps => !!deps))),

    _ConfigType: config,
  }

  const buildDependencyModules = await Bluebird.map(
    module.build.dependencies, d => graph.getModule(getModuleKey(d.name, d.plugin)),
  )
  module.buildDependencies = keyBy(buildDependencyModules, "name")

  return module
}

export function getModuleCacheContext(config: ModuleConfig) {
  return pathToCacheContext(config.path)
}

export function getModuleKey(name: string, plugin?: string) {
  const hasPrefix = !!name.match(/--/)
  return (plugin && !hasPrefix) ? `${plugin}--${name}` : name
}
