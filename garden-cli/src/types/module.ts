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
import { ModuleSpec, ModuleConfig } from "../config/module"
import { ServiceSpec } from "../config/service"
import { ModuleVersion } from "../vcs/base"
import { CacheContext, pathToCacheContext } from "../cache"
import { Garden } from "../garden"
import { serviceFromConfig, Service } from "./service"

export interface BuildCopySpec {
  source: string
  target: string
}

export interface Module<
  M extends ModuleSpec = any,
  S extends ServiceSpec = any,
  T extends TestSpec = any,
  > extends ModuleConfig<M, S, T> {
  buildPath: string
  version: ModuleVersion
  cacheContext: CacheContext

  services: Service<Module<M, S, T>>[]
  serviceNames: string[]
  serviceDependencyNames: string[]

  _ConfigType: ModuleConfig<M, S, T>
}

export interface ModuleMap<T extends Module> {
  [key: string]: T
}

export interface ModuleConfigMap<T extends Module> {
  [key: string]: T
}

export async function moduleFromConfig(garden: Garden, config: ModuleConfig): Promise<Module> {
  const module: Module = {
    ...config,

    buildPath: await garden.buildDir.buildPath(config.name),
    version: await garden.resolveVersion(config.name, config.build.dependencies),
    cacheContext: pathToCacheContext(config.path),

    services: [],
    serviceNames: getNames(config.serviceConfigs),
    serviceDependencyNames: uniq(flatten(config.serviceConfigs
      .map(serviceConfig => serviceConfig.dependencies)
      .filter(deps => !!deps))),

    _ConfigType: config,
  }

  module.services = config.serviceConfigs.map(serviceConfig => serviceFromConfig(module, serviceConfig))

  return module
}

export function getModuleCacheContext(config: ModuleConfig) {
  return pathToCacheContext(config.path)
}

export function getModuleKey(name: string, plugin?: string) {
  return plugin ? `${plugin}--${name}` : name
}
