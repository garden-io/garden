/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { Module, moduleFromConfig, getModuleKey } from "../types/module"
import { BaseTask, TaskType } from "../tasks/base"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { ModuleConfig } from "../config/module"
import { TaskResults } from "../task-graph"
import { keyBy, fromPairs } from "lodash"
import { ConfigurationError } from "../exceptions"
import { RuntimeContext } from "../runtime-context"
import { ModuleConfigContext } from "../config/config-context"
import { ProviderMap } from "../config/provider"
import { resolveModuleConfig } from "../resolve-module"
import { getModuleTemplateReferences } from "../template-string"
import { Profile } from "../util/profiling"

interface ResolveModuleConfigTaskParams {
  garden: Garden
  log: LogEntry
  moduleConfig: ModuleConfig
  resolvedProviders: ProviderMap
  runtimeContext?: RuntimeContext
}

/**
 * Resolve the module configuration, i.e. resolve all template strings and call the provider configure handler(s).
 * If necessary, this may involve resolving dependencies fully (using the ModuleResolveTask, see below).
 */
@Profile()
export class ResolveModuleConfigTask extends BaseTask {
  type: TaskType = "resolve-module-config"

  private moduleConfig: ModuleConfig
  private resolvedProviders: ProviderMap
  private runtimeContext?: RuntimeContext

  constructor({ garden, log, moduleConfig, resolvedProviders, runtimeContext }: ResolveModuleConfigTaskParams) {
    super({ garden, log, force: true, version: garden.version })
    this.moduleConfig = moduleConfig
    this.resolvedProviders = resolvedProviders
    this.runtimeContext = runtimeContext
  }

  async resolveDependencies() {
    const rawConfigs = keyBy(await this.garden.getRawModuleConfigs(), "name")

    const templateRefs = await getModuleTemplateReferences(this.moduleConfig)
    const deps = templateRefs.filter((d) => d[1] !== this.moduleConfig.name)

    return deps.map((d) => {
      const name = d[1]
      const contextKey = d[2] // The template key being referenced on the module
      const moduleConfig = rawConfigs[name]

      if (!moduleConfig) {
        throw new ConfigurationError(
          chalk.red(
            `Could not find build dependency ${chalk.white(name)}, configured in module ${chalk.white(
              this.moduleConfig.name
            )}`
          ),
          { moduleConfig }
        )
      }

      if (contextKey === "version") {
        // Need the full module resolved to get the version
        return new ResolveModuleTask({
          garden: this.garden,
          log: this.log,
          moduleConfig,
          resolvedProviders: this.resolvedProviders,
          runtimeContext: this.runtimeContext,
        })
      } else {
        // Otherwise we just need to resolve the config
        return new ResolveModuleConfigTask({
          garden: this.garden,
          log: this.log,
          moduleConfig,
          resolvedProviders: this.resolvedProviders,
          runtimeContext: this.runtimeContext,
        })
      }
    })
  }

  getName() {
    return this.moduleConfig.name
  }

  getDescription() {
    return `resolving module config ${this.getName()}`
  }

  async process(dependencyResults: TaskResults): Promise<ModuleConfig> {
    const dependencyConfigs = getResolvedModuleConfigs(dependencyResults)
    const dependencyModules = getResolvedModules(dependencyResults)

    const configContext = new ModuleConfigContext({
      garden: this.garden,
      resolvedProviders: this.resolvedProviders,
      variables: this.garden.variables,
      secrets: this.garden.secrets,
      moduleName: this.moduleConfig.name,
      dependencyConfigs: [...dependencyConfigs, ...dependencyModules],
      dependencyVersions: fromPairs(dependencyModules.map((m) => [m.name, m.version])),
      runtimeContext: this.runtimeContext,
    })

    return resolveModuleConfig(this.garden, this.moduleConfig, {
      allowPartial: true,
      configContext,
    })
  }
}

interface ResolveModuleTaskParams {
  garden: Garden
  log: LogEntry
  moduleConfig: ModuleConfig
  resolvedProviders: ProviderMap
  runtimeContext?: RuntimeContext
}

/**
 * Fully resolve the given module config, including its final version and dependencies.
 */
@Profile()
export class ResolveModuleTask extends BaseTask {
  type: TaskType = "resolve-module"

  private moduleConfig: ModuleConfig
  private resolvedProviders: ProviderMap
  private runtimeContext?: RuntimeContext

  constructor({ garden, log, moduleConfig, resolvedProviders, runtimeContext }: ResolveModuleTaskParams) {
    super({ garden, log, force: true, version: garden.version })
    this.moduleConfig = moduleConfig
    this.resolvedProviders = resolvedProviders
    this.runtimeContext = runtimeContext
  }

  async resolveDependencies() {
    const rawConfigs = keyBy(await this.garden.getRawModuleConfigs(), "name")

    const deps = this.moduleConfig.build.dependencies
      .map((d) => getModuleKey(d.name, d.plugin))
      .map((key) => {
        const moduleConfig = rawConfigs[key]

        if (!moduleConfig) {
          throw new ConfigurationError(
            chalk.red(
              `Could not find build dependency ${chalk.white(key)}, configured in module ${chalk.white(
                this.moduleConfig.name
              )}`
            ),
            { moduleConfig }
          )
        }

        return new ResolveModuleTask({
          garden: this.garden,
          log: this.log,
          moduleConfig,
          resolvedProviders: this.resolvedProviders,
          runtimeContext: this.runtimeContext,
        })
      })

    return [
      // Need to resolve own config
      new ResolveModuleConfigTask({
        garden: this.garden,
        log: this.log,
        moduleConfig: this.moduleConfig,
        resolvedProviders: this.resolvedProviders,
        runtimeContext: this.runtimeContext,
      }),
      // As well as all the module's build dependencies
      ...deps,
    ]
  }

  getName() {
    return this.moduleConfig.name
  }

  getDescription() {
    return `resolving module ${this.getName()}`
  }

  async process(dependencyResults: TaskResults): Promise<Module> {
    const resolvedConfig = dependencyResults["resolve-module-config." + this.getName()]!.output as ModuleConfig
    const dependencyModules = getResolvedModules(dependencyResults)

    return moduleFromConfig(this.garden, resolvedConfig, dependencyModules)
  }
}

function getResolvedModuleConfigs(dependencyResults: TaskResults): ModuleConfig[] {
  return Object.values(dependencyResults)
    .filter((r) => r && r.type === "resolve-module-config")
    .map((r) => r!.output) as ModuleConfig[]
}

export function getResolvedModules(dependencyResults: TaskResults): Module[] {
  return Object.values(dependencyResults)
    .filter((r) => r && r.type === "resolve-module")
    .map((r) => r!.output) as Module[]
}
