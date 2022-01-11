/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { cloneDeep, keyBy } from "lodash"
import { validateWithPath } from "./config/validation"
import {
  resolveTemplateStrings,
  getModuleTemplateReferences,
  resolveTemplateString,
} from "./template-string/template-string"
import { ContextResolveOpts, GenericContext } from "./config/template-contexts/base"
import { relative, resolve, posix, dirname } from "path"
import { Garden } from "./garden"
import { ConfigurationError, FilesystemError, PluginError } from "./exceptions"
import { deline, dedent } from "./util/string"
import { getModuleKey, ModuleConfigMap, GardenModule, ModuleMap, moduleFromConfig } from "./types/module"
import { getModuleTypeBases } from "./plugins"
import { ModuleConfig, moduleConfigSchema } from "./config/module"
import { Profile } from "./util/profiling"
import { getLinkedSources } from "./util/ext-source-util"
import { allowUnknown, DeepPrimitiveMap } from "./config/common"
import { ProviderMap } from "./config/provider"
import { RuntimeContext } from "./runtime-context"
import chalk from "chalk"
import { DependencyValidationGraph } from "./util/validate-dependencies"
import Bluebird from "bluebird"
import { readFile, mkdirp, writeFile } from "fs-extra"
import { LogEntry } from "./logger/log-entry"
import { ModuleConfigContext, ModuleConfigContextParams } from "./config/template-contexts/module"
import { pathToCacheContext } from "./cache"
import { loadVarfile } from "./config/project"
import { merge } from "json-merge-patch"
import { prepareBuildDependencies } from "./config/base"

// This limit is fairly arbitrary, but we need to have some cap on concurrent processing.
export const moduleResolutionConcurrencyLimit = 40

/**
 * Resolves a set of module configurations in dependency order.
 *
 * This operates differently than the TaskGraph in that it can add dependency links as it proceeds through the modules,
 * which is important because dependencies can be discovered mid-stream, and the TaskGraph currently needs to
 * statically resolve all dependencies before processing tasks.
 */
@Profile()
export class ModuleResolver {
  private garden: Garden
  private log: LogEntry
  private rawConfigs: ModuleConfig[]
  private rawConfigsByName: ModuleConfigMap
  private resolvedProviders: ProviderMap
  private runtimeContext?: RuntimeContext

  constructor({
    garden,
    log,
    rawConfigs,
    resolvedProviders,
    runtimeContext,
  }: {
    garden: Garden
    log: LogEntry
    rawConfigs: ModuleConfig[]
    resolvedProviders: ProviderMap
    runtimeContext?: RuntimeContext
  }) {
    this.garden = garden
    this.log = log
    this.rawConfigs = rawConfigs
    this.rawConfigsByName = keyBy(rawConfigs, "name")
    this.resolvedProviders = resolvedProviders
    this.runtimeContext = runtimeContext
  }

  async resolveAll() {
    // Collect template references for every raw config and work out module references in templates and explicit
    // dependency references. We use two graphs, one will be fully populated as we progress, the other we gradually
    // remove nodes from as we complete the processing.
    const fullGraph = new DependencyValidationGraph()
    const processingGraph = new DependencyValidationGraph()

    for (const rawConfig of this.rawConfigs) {
      for (const graph of [fullGraph, processingGraph]) {
        graph.addNode(rawConfig.name)
      }
    }
    for (const rawConfig of this.rawConfigs) {
      const buildPath = await this.garden.buildStaging.buildPath(rawConfig)
      const deps = this.getModuleDependenciesFromTemplateStrings(rawConfig, buildPath)
      for (const graph of [fullGraph, processingGraph]) {
        for (const dep of deps) {
          graph.addNode(dep.name)
          graph.addDependency(rawConfig.name, dep.name)
        }
      }
    }

    const resolvedConfigs: ModuleConfigMap = {}
    const resolvedModules: ModuleMap = {}
    const errors: { [moduleName: string]: Error } = {}

    // Iterate through dependency graph, a batch of leaves at a time. While there are items remaining:
    while (processingGraph.size() > 0) {
      // Get batch of leaf nodes (ones with no unresolved dependencies). Implicitly checks for circular dependencies.
      let batch: string[]

      try {
        batch = processingGraph.overallOrder(true)
      } catch (err) {
        throw new ConfigurationError(
          dedent`
            Detected circular dependencies between module configurations:

            ${err.detail?.["circular-dependencies"] || err.message}
          `,
          { cycles: err.detail?.cycles }
        )
      }

      // Process each of the leaf node module configs.
      await Bluebird.map(
        batch,
        async (moduleName) => {
          // Resolve configuration, unless previously resolved.
          let resolvedConfig = resolvedConfigs[moduleName]
          let foundNewDependency = false

          const dependencyNames = fullGraph.dependenciesOf(moduleName)
          const resolvedDependencies = dependencyNames.map((n) => resolvedModules[n])

          try {
            if (!resolvedConfig) {
              const rawConfig = this.rawConfigsByName[moduleName]

              resolvedConfig = resolvedConfigs[moduleName] = await this.resolveModuleConfig(
                rawConfig,
                resolvedDependencies
              )

              // Check if any new build dependencies were added by the configure handler
              for (const dep of resolvedConfig.build.dependencies) {
                if (!dependencyNames.includes(dep.name)) {
                  foundNewDependency = true

                  // We throw if the build dependency can't be found at all
                  if (!fullGraph.hasNode(dep.name)) {
                    this.missingBuildDependency(moduleName, dep.name)
                  }
                  fullGraph.addDependency(moduleName, dep.name)

                  // The dependency may already have been processed, we don't want to add it to the graph in that case
                  if (processingGraph.hasNode(dep.name)) {
                    processingGraph.addDependency(moduleName, dep.name)
                  }
                }
              }
            }

            // If no build dependency was added, fully resolve the module and remove from graph, otherwise keep it
            // in the graph and move on to make sure we fully resolve the dependencies and don't run into circular
            // dependencies.
            if (!foundNewDependency) {
              const buildPath = await this.garden.buildStaging.buildPath(resolvedConfig)
              resolvedModules[moduleName] = await this.resolveModule(resolvedConfig, buildPath, resolvedDependencies)
              processingGraph.removeNode(moduleName)
            }
          } catch (err) {
            errors[moduleName] = err
          }
        },
        { concurrency: moduleResolutionConcurrencyLimit }
      )

      if (Object.keys(errors).length > 0) {
        const errorStr = Object.entries(errors)
          .map(([name, err]) => `${chalk.white.bold(name)}: ${err.message}`)
          .join("\n")
        const errorStack = Object.entries(errors)
          .map(([name, err]) => `${chalk.white.bold(name)}: ${err.stack || err.message}`)
          .join("\n\n")

        const msg = `Failed resolving one or more modules:\n\n${errorStr}`

        const combined = new ConfigurationError(chalk.red(msg), { ...errors })
        combined.stack = errorStack
        throw combined
      }
    }

    return Object.values(resolvedModules)
  }

  /**
   * Returns module configs for each module that is referenced in a ${modules.*} template string in the raw config.
   */
  private getModuleDependenciesFromTemplateStrings(rawConfig: ModuleConfig, buildPath: string) {
    const configContext = new ModuleConfigContext({
      garden: this.garden,
      variables: this.garden.variables,
      resolvedProviders: this.resolvedProviders,
      moduleConfig: rawConfig,
      buildPath,
      modules: [],
      runtimeContext: this.runtimeContext,
      partialRuntimeResolution: true,
    })

    const templateRefs = getModuleTemplateReferences(rawConfig, configContext)
    const deps = templateRefs.filter((d) => d[1] !== rawConfig.name)

    return deps.map((d) => {
      const name = d[1]
      const moduleConfig = this.rawConfigsByName[name]

      if (!moduleConfig) {
        this.missingBuildDependency(rawConfig.name, name as string)
      }

      return moduleConfig
    })
  }

  private missingBuildDependency(moduleName: string, dependencyName: string) {
    throw new ConfigurationError(
      chalk.red(
        `Could not find build dependency ${chalk.white(dependencyName)}, ` +
          `configured in module ${chalk.white(moduleName)}`
      ),
      { moduleName, dependencyName }
    )
  }

  /**
   * Resolves and validates a single module configuration.
   */
  async resolveModuleConfig(config: ModuleConfig, dependencies: GardenModule[]): Promise<ModuleConfig> {
    const garden = this.garden
    let inputs = {}

    const buildPath = await this.garden.buildStaging.buildPath(config)

    const templateContextParams: ModuleConfigContextParams = {
      garden,
      variables: garden.variables,
      resolvedProviders: this.resolvedProviders,
      modules: dependencies,
      moduleConfig: config,
      buildPath,
      runtimeContext: this.runtimeContext,
      partialRuntimeResolution: true,
    }

    // Resolve and validate the inputs field, because template module inputs may not be fully resolved at this
    // time.
    // TODO: This whole complicated procedure could be much improved and simplified by implementing lazy resolution on
    // values... I'll be looking into that. - JE
    const templateName = config.templateName

    if (templateName) {
      const template = this.garden.moduleTemplates[templateName]

      inputs = resolveTemplateStrings(
        inputs,
        new ModuleConfigContext(templateContextParams),
        // Not all inputs may need to be resolvable
        { allowPartial: true }
      )

      inputs = validateWithPath({
        config: cloneDeep(config.inputs || {}),
        configType: `inputs for module ${config.name}`,
        path: config.configPath || config.path,
        schema: template.inputsSchema,
        projectRoot: garden.projectRoot,
      })

      config.inputs = inputs
    }

    // Resolve the variables field before resolving everything else (overriding with module varfiles if present)
    const resolvedModuleVariables = await this.resolveVariables(config, templateContextParams)

    // Now resolve just references to inputs on the config
    config = resolveTemplateStrings(cloneDeep(config), new GenericContext({ inputs }), {
      allowPartial: true,
    })

    // And finally fully resolve the config
    const configContext = new ModuleConfigContext({
      ...templateContextParams,
      moduleConfig: config,
      variables: { ...garden.variables, ...resolvedModuleVariables },
    })

    config = resolveTemplateStrings({ ...config, inputs: {}, variables: {} }, configContext, {
      allowPartial: false,
    })

    config.variables = resolvedModuleVariables
    config.inputs = inputs

    const moduleTypeDefinitions = await garden.getModuleTypes()
    const description = moduleTypeDefinitions[config.type]

    if (!description) {
      const configPath = relative(garden.projectRoot, config.configPath || config.path)

      throw new ConfigurationError(
        deline`
        Unrecognized module type '${config.type}' (defined at ${configPath}).
        Are you missing a provider configuration?
        `,
        { config, configuredModuleTypes: Object.keys(moduleTypeDefinitions) }
      )
    }

    // We allow specifying modules by name only as a shorthand:
    //
    // dependencies:
    //   - foo-module
    //   - name: foo-module // same as the above
    //
    // Empty strings and nulls are omitted from the array.
    if (config.build && config.build.dependencies) {
      config.build.dependencies = prepareBuildDependencies(config.build.dependencies).filter((dep) => dep.name)
    }

    // We need to refilter the build dependencies on the spec in case one or more dependency names resolved to null.
    if (config.spec.build && config.spec.build.dependencies) {
      config.spec.build.dependencies = prepareBuildDependencies(config.spec.build.dependencies)
    }

    // Validate the module-type specific spec
    if (description.schema) {
      config.spec = validateWithPath({
        config: config.spec,
        configType: "Module",
        schema: description.schema,
        name: config.name,
        path: config.path,
        projectRoot: garden.projectRoot,
      })
    }

    // Validate the base config schema
    config = validateWithPath({
      config,
      schema: moduleConfigSchema(),
      configType: "module",
      name: config.name,
      path: config.path,
      projectRoot: garden.projectRoot,
    })

    if (config.repositoryUrl) {
      const linkedSources = await getLinkedSources(garden, "module")
      config.path = await garden.loadExtSourcePath({
        name: config.name,
        linkedSources,
        repositoryUrl: config.repositoryUrl,
        sourceType: "module",
      })
    }

    const actions = await garden.getActionRouter()
    const configureResult = await actions.configureModule({
      moduleConfig: config,
      log: garden.log,
    })

    config = configureResult.moduleConfig

    // Validate the configure handler output against the module type's bases
    const bases = getModuleTypeBases(moduleTypeDefinitions[config.type], moduleTypeDefinitions)

    for (const base of bases) {
      if (base.schema) {
        garden.log.silly(`Validating '${config.name}' config against '${base.name}' schema`)

        config.spec = <ModuleConfig>validateWithPath({
          config: config.spec,
          schema: allowUnknown(base.schema),
          path: garden.projectRoot,
          projectRoot: garden.projectRoot,
          configType: `configuration for module '${config.name}' (base schema from '${base.name}' plugin)`,
          ErrorClass: ConfigurationError,
        })
      }
    }

    // FIXME: We should be able to avoid this
    config.name = getModuleKey(config.name, config.plugin)

    if (config.plugin) {
      for (const serviceConfig of config.serviceConfigs) {
        serviceConfig.name = getModuleKey(serviceConfig.name, config.plugin)
      }
      for (const taskConfig of config.taskConfigs) {
        taskConfig.name = getModuleKey(taskConfig.name, config.plugin)
      }
      for (const testConfig of config.testConfigs) {
        testConfig.name = getModuleKey(testConfig.name, config.plugin)
      }
    }

    return config
  }

  private async resolveModule(resolvedConfig: ModuleConfig, buildPath: string, dependencies: GardenModule[]) {
    // Write module files
    const configContext = new ModuleConfigContext({
      garden: this.garden,
      resolvedProviders: this.resolvedProviders,
      variables: { ...this.garden.variables, ...resolvedConfig.variables },
      moduleConfig: resolvedConfig,
      buildPath,
      modules: dependencies,
      runtimeContext: this.runtimeContext,
      partialRuntimeResolution: true,
    })

    await Bluebird.map(resolvedConfig.generateFiles || [], async (fileSpec) => {
      let contents = fileSpec.value || ""

      if (fileSpec.sourcePath) {
        const configDir = resolvedConfig.configPath ? dirname(resolvedConfig.configPath) : resolvedConfig.path
        const sourcePath = resolve(configDir, fileSpec.sourcePath)

        try {
          contents = (await readFile(sourcePath)).toString()
        } catch (err) {
          throw new ConfigurationError(
            `Unable to read file at ${sourcePath}, specified under generateFiles in module ${resolvedConfig.name}: ${err}`,
            {
              sourcePath,
            }
          )
        }
      }

      const resolvedContents = fileSpec.resolveTemplates
        ? resolveTemplateString(contents, configContext, { unescape: true })
        : contents

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

    // Make sure version is re-computed after writing files
    if (!!resolvedConfig.generateFiles?.length) {
      const cacheContext = pathToCacheContext(resolvedConfig.path)
      this.garden.cache.invalidateUp(cacheContext)
    }

    const module = await moduleFromConfig({
      garden: this.garden,
      log: this.log,
      config: resolvedConfig,
      buildDependencies: dependencies,
    })

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

  /**
   * Resolves module variables with the following precedence order:
   *
   *   garden.cliVariables > module varfile > config.variables
   */
  private async resolveVariables(
    config: ModuleConfig,
    templateContextParams: ModuleConfigContextParams
  ): Promise<DeepPrimitiveMap> {
    const moduleConfigContext = new ModuleConfigContext(templateContextParams)
    const resolveOpts = { allowPartial: false }
    let varfileVars: DeepPrimitiveMap = {}
    if (config.varfile) {
      const varfilePath = resolveTemplateString(config.varfile, moduleConfigContext, resolveOpts)
      varfileVars = await loadVarfile({
        configRoot: config.path,
        path: varfilePath,
        defaultPath: undefined,
      })
    }

    const rawVariables = config.variables
    const moduleVariables = resolveTemplateStrings(cloneDeep(rawVariables || {}), moduleConfigContext, resolveOpts)
    const mergedVariables: DeepPrimitiveMap = <any>merge(moduleVariables, merge(varfileVars, this.garden.cliVariables))
    return mergedVariables
  }
}

export interface ModuleConfigResolveOpts extends ContextResolveOpts {
  configContext: ModuleConfigContext
}
