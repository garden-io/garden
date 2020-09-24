/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { GardenModule, moduleFromConfig, getModuleKey } from "../types/module"
import { BaseTask, TaskType } from "../tasks/base"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { ModuleConfig } from "../config/module"
import { GraphResults } from "../task-graph"
import { keyBy } from "lodash"
import { ConfigurationError, PluginError, FilesystemError } from "../exceptions"
import { RuntimeContext } from "../runtime-context"
import { ModuleConfigContext } from "../config/config-context"
import { ProviderMap } from "../config/provider"
import { resolveModuleConfig } from "../resolve-module"
import { getModuleTemplateReferences, resolveTemplateString } from "../template-string"
import { Profile } from "../util/profiling"
import { validateWithPath } from "../config/validation"
import { getModuleTypeBases } from "../plugins"
import Bluebird from "bluebird"
import { posix, resolve } from "path"
import { mkdirp, writeFile, readFile } from "fs-extra"

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

    const configContext = new ModuleConfigContext({
      garden: this.garden,
      resolvedProviders: this.resolvedProviders,
      moduleName: this.moduleConfig.name,
      dependencies: [],
      runtimeContext: this.runtimeContext,
      parentName: this.moduleConfig.parentName,
      templateName: this.moduleConfig.templateName,
      inputs: this.moduleConfig.inputs,
    })

    const templateRefs = getModuleTemplateReferences(this.moduleConfig, configContext)
    const deps = templateRefs.filter((d) => d[1] !== this.moduleConfig.name)

    return deps.map((d) => {
      const name = d[1]
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

      return new ResolveModuleTask({
        garden: this.garden,
        log: this.log,
        moduleConfig,
        resolvedProviders: this.resolvedProviders,
        runtimeContext: this.runtimeContext,
      })
    })
  }

  getName() {
    return this.moduleConfig.name
  }

  getDescription() {
    return `resolving module config ${this.getName()}`
  }

  async process(dependencyResults: GraphResults): Promise<ModuleConfig> {
    const dependencies = getResolvedModules(dependencyResults)

    const configContext = new ModuleConfigContext({
      garden: this.garden,
      resolvedProviders: this.resolvedProviders,
      moduleName: this.moduleConfig.name,
      dependencies,
      runtimeContext: this.runtimeContext,
      parentName: this.moduleConfig.parentName,
      templateName: this.moduleConfig.templateName,
      inputs: this.moduleConfig.inputs,
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

export const moduleResolutionConcurrencyLimit = 40

/**
 * Fully resolve the given module config, including its final version and dependencies.
 */
@Profile()
export class ResolveModuleTask extends BaseTask {
  type: TaskType = "resolve-module"

  // It's advisable to have _some_ limit (say if you have hundreds of modules), because the filesystem scan can cost
  // a bit of memory, but we make it quite a bit higher than other tasks.
  concurrencyLimit = moduleResolutionConcurrencyLimit

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

  async process(dependencyResults: GraphResults): Promise<GardenModule> {
    const resolvedConfig = dependencyResults["resolve-module-config." + this.getName()]!.output as ModuleConfig
    const dependencyModules = getResolvedModules(dependencyResults)

    // Write module files
    const configContext = new ModuleConfigContext({
      garden: this.garden,
      resolvedProviders: this.resolvedProviders,
      moduleName: this.moduleConfig.name,
      dependencies: dependencyModules,
      runtimeContext: this.runtimeContext,
      parentName: this.moduleConfig.parentName,
      templateName: this.moduleConfig.templateName,
      inputs: this.moduleConfig.inputs,
    })

    await Bluebird.map(resolvedConfig.generateFiles || [], async (fileSpec) => {
      let contents = fileSpec.value || ""

      if (fileSpec.sourcePath) {
        contents = (await readFile(fileSpec.sourcePath)).toString()
        contents = await resolveTemplateString(contents, configContext)
      }

      const resolvedContents = resolveTemplateString(contents, configContext)
      const targetDir = resolve(resolvedConfig.path, ...posix.dirname(fileSpec.targetPath).split(posix.sep))
      const targetPath = resolve(resolvedConfig.path, ...fileSpec.targetPath.split(posix.sep))

      try {
        await mkdirp(targetDir)
        await writeFile(targetPath, resolvedContents)
      } catch (error) {
        throw new FilesystemError(
          `Unable to write templated file ${fileSpec.targetPath} from ${resolvedConfig.name}: ${error.message}`,
          {
            fileSpec,
            error,
          }
        )
      }
    })

    const module = await moduleFromConfig(this.garden, this.log, resolvedConfig, dependencyModules)

    const moduleTypeDefinitions = await this.garden.getModuleTypes()
    const description = moduleTypeDefinitions[module.type]!

    // Validate the module outputs against the outputs schema
    if (description.moduleOutputsSchema) {
      module.outputs = validateWithPath({
        config: module.outputs,
        schema: description.moduleOutputsSchema,
        configType: `outputs for module`,
        name: module.name,
        path: module.configPath || module.path,
        projectRoot: this.garden.projectRoot,
        ErrorClass: PluginError,
      })
    }

    // Validate the module outputs against the module type's bases
    const bases = getModuleTypeBases(moduleTypeDefinitions[module.type], moduleTypeDefinitions)

    for (const base of bases) {
      if (base.moduleOutputsSchema) {
        this.log.silly(`Validating '${module.name}' module outputs against '${base.name}' schema`)

        module.outputs = validateWithPath({
          config: module.outputs,
          schema: base.moduleOutputsSchema.unknown(true),
          path: module.configPath || module.path,
          projectRoot: this.garden.projectRoot,
          configType: `outputs for module '${module.name}' (base schema from '${base.name}' plugin)`,
          ErrorClass: PluginError,
        })
      }
    }

    return module
  }
}

export function getResolvedModules(dependencyResults: GraphResults): GardenModule[] {
  return Object.values(dependencyResults)
    .filter((r) => r && r.type === "resolve-module")
    .map((r) => r!.output) as GardenModule[]
}
