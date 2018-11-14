/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import { flatten } from "lodash"
import { computeAutoReloadDependants, withDependants } from "../watch"
import { DeployTask } from "./deploy"
import { getNames } from "../util/util"
import { Garden } from "../garden"
import { Module } from "../types/module"

/**
 * @param hotReloadServiceNames - names of services with hot reloading enabled (should not be redeployed)
 */
export async function getTasksForHotReload(
  { garden, module, hotReloadServiceNames, serviceNames }:
    { garden: Garden, module: Module, hotReloadServiceNames: string[], serviceNames: string[] },
) {

  const hotReloadModuleNames = await getHotReloadModuleNames(garden, hotReloadServiceNames)

  const modulesForDeployment = (await withDependants(garden, [module],
    await computeAutoReloadDependants(garden)))
    .filter(m => !hotReloadModuleNames.has(m.name))

  return (await servicesForModules(garden, modulesForDeployment, serviceNames))
    .map(service => new DeployTask({
      garden, service, force: true, forceBuild: true, watch: true, hotReloadServiceNames,
    }))

}

export async function getHotReloadModuleNames(garden: Garden, hotReloadServiceNames: string[]): Promise<Set<string>> {
  return new Set(flatten((await garden.getServices(hotReloadServiceNames || []))
    .map(s => s.module.name)))
}

export async function getDeployTasks(
  { garden, module, serviceNames, hotReloadServiceNames, force = false, forceBuild = false,
    watch = false, includeDependants = false }:
    {
      garden: Garden, module: Module, serviceNames?: string[], hotReloadServiceNames: string[],
      force?: boolean, forceBuild?: boolean, watch?: boolean, includeDependants?: boolean,
    },
) {

  const modulesForDeployment = includeDependants
    ? (await withDependants(garden, [module], await computeAutoReloadDependants(garden)))
    : [module]

  return (await servicesForModules(garden, modulesForDeployment, serviceNames))
    .map(service => new DeployTask({ garden, service, force, forceBuild, watch, hotReloadServiceNames }))

}

async function servicesForModules(garden: Garden, modules: Module[], serviceNames?: string[]) {
  const moduleServices = flatten(await Bluebird.map(
    modules,
    m => garden.getServices(getNames(m.serviceConfigs))))

  return serviceNames
    ? moduleServices.filter(s => serviceNames.includes(s.name))
    : moduleServices
}
