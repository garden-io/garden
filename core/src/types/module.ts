/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cloneDeep from "fast-copy"
import { flatten, uniq, some } from "lodash-es"
import { getNames, findByName } from "../util/util.js"
import type { ModuleConfig } from "../config/module.js"
import { moduleConfigSchema } from "../config/module.js"
import type { ModuleVersion } from "../vcs/vcs.js"
import { pathToCacheContext } from "../cache.js"
import type { Garden } from "../garden.js"
import type { DeepPrimitiveMap } from "../config/common.js"
import { joiArray, joiIdentifier, joiIdentifierMap, joi, moduleVersionSchema, createSchema } from "../config/common.js"
import { moduleOutputsSchema } from "../plugin/handlers/Module/get-outputs.js"
import type { Log } from "../logger/log-entry.js"
import type { ModuleTypeDefinition } from "../plugin/module-types.js"
import type { GardenPluginSpec } from "../plugin/plugin.js"
import { join } from "path"
import { RuntimeError } from "../exceptions.js"
import { naturalList } from "../util/string.js"

export interface ModuleType<T extends GardenModule = GardenModule> extends ModuleTypeDefinition<T> {
  plugin: GardenPluginSpec
  needsBuild: boolean
}

export interface ModuleTypeMap {
  [name: string]: ModuleType
}

/**
 * The Module interface adds several internally managed keys to the ModuleConfig type.
 */
export interface GardenModule<
  M extends {} = any,
  S extends {} = any,
  T extends {} = any,
  W extends {} = any,
  O extends {} = any,
> extends ModuleConfig<M, S, T, W> {
  buildPath: string
  needsBuild: boolean

  version: ModuleVersion

  buildDependencies: ModuleMap
  outputs: O

  serviceNames: string[]
  serviceDependencyNames: string[]

  taskNames: string[]
  taskDependencyNames: string[]

  variables: DeepPrimitiveMap

  compatibleTypes: string[]
  _config: ModuleConfig<M, S, T, W>
}

export const moduleSchema = createSchema({
  name: "resolved-module",
  extend: moduleConfigSchema,
  keys: () => ({
    buildPath: joi.string().required().description("The path to the build staging directory for the module."),
    compatibleTypes: joiArray(joiIdentifier())
      .required()
      .description("A list of types that this module is compatible with (i.e. the module type itself + all bases)."),
    configPath: joi.string().description("The path to the module config file, if applicable."),
    version: moduleVersionSchema().required(),
    buildDependencies: joiIdentifierMap(joi.link("...")).description(
      "A map of all modules referenced under `build.dependencies`."
    ),
    needsBuild: joi
      .boolean()
      .required()
      .description(
        "Indicate whether the module needs to be built (i.e. has a build handler or needs to copy dependencies)."
      ),
    outputs: moduleOutputsSchema(),
    serviceNames: joiArray(joiIdentifier())
      .required()
      .description("The names of the services that the module provides."),
    serviceDependencyNames: joiArray(joiIdentifier())
      .required()
      .description("The names of all the services and tasks that the services in this module depend on."),
    taskNames: joiArray(joiIdentifier()).required().description("The names of the tasks that the module provides."),
    taskDependencyNames: joiArray(joiIdentifier())
      .required()
      .description("The names of all the tasks and services that the tasks in this module depend on."),
  }),
})

export interface ModuleMap<T extends GardenModule = GardenModule> {
  [key: string]: T
}

export interface ModuleConfigMap<T extends ModuleConfig = ModuleConfig> {
  [key: string]: T
}

export async function moduleFromConfig({
  garden,
  log,
  config,
  buildDependencies,
  forceVersion = false,
  scanRoot,
}: {
  garden: Garden
  log: Log
  config: ModuleConfig
  buildDependencies: GardenModule[]
  forceVersion?: boolean
  scanRoot?: string
}): Promise<GardenModule> {
  const version = await garden.resolveModuleVersion({
    log,
    moduleConfig: config,
    moduleDependencies: buildDependencies,
    force: forceVersion,
    scanRoot,
  })
  const actions = await garden.getActionRouter()
  const { outputs } = await actions.module.getModuleOutputs({ log, moduleConfig: config, version })
  const moduleTypes = await garden.getModuleTypes()
  const compatibleTypes = [config.type, ...getModuleTypeBases(moduleTypes[config.type], moduleTypes).map((t) => t.name)]

  // Special-casing local modules, otherwise setting build path as <build dir>/<module name>
  const buildPath = config.local ? config.path : join(garden.buildStaging.buildDirPath, config.name)

  await garden.buildStaging.ensureDir(buildPath)

  const module: GardenModule = {
    ...cloneDeep(config),

    buildPath,

    version,
    needsBuild: moduleNeedsBuild(config, moduleTypes[config.type]),

    buildDependencies: {},
    outputs,

    serviceNames: getNames(config.serviceConfigs),
    serviceDependencyNames: uniq(
      flatten(config.serviceConfigs.map((serviceConfig) => serviceConfig.dependencies).filter((deps) => !!deps))
    ),

    taskNames: getNames(config.taskConfigs),
    taskDependencyNames: uniq(
      flatten(config.taskConfigs.map((taskConfig) => taskConfig.dependencies).filter((deps) => !!deps))
    ),

    variables: config.variables || {},

    compatibleTypes,
    _config: config,
  }

  for (const d of module.build.dependencies) {
    const key = d.name
    module.buildDependencies[key] = findByName(buildDependencies, key)!
  }

  return module
}

export function moduleNeedsBuild(moduleConfig: ModuleConfig, moduleType: ModuleType) {
  return moduleType.needsBuild || some(moduleConfig.build.dependencies, (d) => d.copy && d.copy.length > 0)
}

export function getModuleCacheContext<M extends ModuleConfig>(config: M) {
  return pathToCacheContext(config.path)
}

export function moduleTestNameToActionName(moduleName: string, testName: string) {
  return `${moduleName}-${testName}`
}

/**
 * Recursively resolves all the bases for the given module type, ordered from closest base to last.
 */
export function getModuleTypeBases(
  moduleType: ModuleTypeDefinition,
  moduleTypes: { [name: string]: ModuleTypeDefinition }
): ModuleTypeDefinition[] {
  if (!moduleType.base) {
    return []
  }

  const base = moduleTypes[moduleType.base]

  if (!base) {
    const name = moduleType.name
    throw new RuntimeError({
      message: `Unable to find base module type '${
        moduleType.base
      }' for module type '${name}'. Available module types: ${naturalList(Object.keys(moduleTypes))}`,
    })
  }

  return [base, ...getModuleTypeBases(base, moduleTypes)]
}
