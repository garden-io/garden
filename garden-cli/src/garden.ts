/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import {
  parse,
  relative,
  resolve,
  sep,
} from "path"
import {
  extend,
  flatten,
  isString,
  fromPairs,
  merge,
  keyBy,
  cloneDeep,
  pickBy,
  sortBy,
  uniqBy,
} from "lodash"
const AsyncLock = require("async-lock")

import { TreeCache } from "./cache"
import {
  builtinPlugins,
  fixedPlugins,
} from "./plugins/plugins"
import { Module, moduleFromConfig, getModuleCacheContext, getModuleKey, ModuleConfigMap } from "./types/module"
import {
  moduleActionDescriptions,
  moduleActionNames,
  pluginActionDescriptions,
  pluginModuleSchema,
  pluginSchema,
  RegisterPluginParam,
} from "./types/plugin/plugin"
import { Environment, SourceConfig, defaultProvider } from "./config/project"
import {
  findByName,
  getIgnorer,
  getNames,
  scanDirectory,
  pickKeys,
} from "./util/util"
import {
  DEFAULT_NAMESPACE,
  MODULE_CONFIG_FILENAME,
  ERROR_LOG_FILENAME,
} from "./constants"
import {
  ConfigurationError,
  ParameterError,
  PluginError,
} from "./exceptions"
import { VcsHandler, ModuleVersion } from "./vcs/base"
import { GitHandler } from "./vcs/git"
import { BuildDir } from "./build-dir"
import {
  TaskGraph,
  TaskResults,
} from "./task-graph"
import {
  getLogger,
  RootLogNode,
} from "./logger/logger"
import {
  pluginActionNames,
  PluginActions,
  PluginFactory,
  GardenPlugin,
  ModuleActions,
} from "./types/plugin/plugin"
import { joiIdentifier, validate } from "./config/common"
import { Service } from "./types/service"
import { resolveTemplateStrings } from "./template-string"
import {
  configSchema,
  GardenConfig,
  loadConfig,
  findProjectConfig,
} from "./config/base"
import { Task } from "./tasks/base"
import { LocalConfigStore } from "./config-store"
import { detectCircularDependencies } from "./util/detectCycles"
import {
  getLinkedSources,
  ExternalSourceType,
} from "./util/ext-source-util"
import { BuildDependencyConfig, ModuleConfig } from "./config/module"
import { ProjectConfigContext, ModuleConfigContext } from "./config/config-context"
import { LogLevel } from "./logger/types"
import { FileWriter } from "./logger/writers/file-writer"
import { ActionHelper } from "./actions"
import { createPluginContext } from "./plugin-context"
import { ModuleAndServiceActions } from "./types/plugin/plugin"

export interface ActionHandlerMap<T extends keyof PluginActions> {
  [actionName: string]: PluginActions[T]
}

export interface ModuleActionHandlerMap<T extends keyof ModuleAndServiceActions> {
  [actionName: string]: ModuleAndServiceActions[T]
}

export type PluginActionMap = {
  [A in keyof PluginActions]: {
    [pluginName: string]: PluginActions[A],
  }
}

export type ModuleActionMap = {
  [A in keyof ModuleAndServiceActions]: {
    [moduleType: string]: {
      [pluginName: string]: ModuleAndServiceActions[A],
    },
  }
}

export interface ContextOpts {
  config?: GardenConfig,
  env?: string,
  logger?: RootLogNode,
  plugins?: RegisterPluginParam[],
}

const scanLock = new AsyncLock()

const fileWriterConfigs = [
  { filename: "development.log" },
  { filename: ERROR_LOG_FILENAME, level: LogLevel.error },
  { filename: ERROR_LOG_FILENAME, level: LogLevel.error, path: ".", truncatePrevious: true },
]

export class Garden {
  public readonly log: RootLogNode
  public readonly actionHandlers: PluginActionMap
  public readonly moduleActionHandlers: ModuleActionMap

  private readonly loadedPlugins: { [key: string]: GardenPlugin }
  private moduleConfigs: ModuleConfigMap
  private modulesScanned: boolean
  private readonly registeredPlugins: { [key: string]: PluginFactory }
  private readonly serviceNameIndex: { [key: string]: string }
  private readonly taskGraph: TaskGraph

  public readonly localConfigStore: LocalConfigStore
  public readonly vcs: VcsHandler
  public readonly cache: TreeCache
  public readonly actions: ActionHelper

  constructor(
    public readonly projectRoot: string,
    public readonly projectName: string,
    public readonly environment: Environment,
    public readonly projectSources: SourceConfig[] = [],
    public readonly buildDir: BuildDir,
    logger?: RootLogNode,
  ) {
    this.modulesScanned = false
    this.log = logger || getLogger()
    // TODO: Support other VCS options.
    this.vcs = new GitHandler(this.projectRoot)
    this.localConfigStore = new LocalConfigStore(this.projectRoot)
    this.cache = new TreeCache()

    this.moduleConfigs = {}
    this.serviceNameIndex = {}
    this.loadedPlugins = {}
    this.registeredPlugins = {}
    this.actionHandlers = <PluginActionMap>fromPairs(pluginActionNames.map(n => [n, {}]))
    this.moduleActionHandlers = <ModuleActionMap>fromPairs(moduleActionNames.map(n => [n, {}]))

    this.taskGraph = new TaskGraph(this)
    this.actions = new ActionHelper(this)
  }

  static async factory(currentDirectory: string, { env, config, logger, plugins = [] }: ContextOpts = {}) {
    let parsedConfig: GardenConfig

    if (config) {
      parsedConfig = <GardenConfig>validate(config, configSchema, { context: "root configuration" })

      if (!parsedConfig.project) {
        throw new ConfigurationError(`Supplied config does not contain a project configuration`, {
          currentDirectory,
          config,
        })
      }
    } else {
      config = await findProjectConfig(currentDirectory)

      if (!config || !config.project) {
        throw new ConfigurationError(
          `Not a project directory (or any of the parent directories): ${currentDirectory}`,
          { currentDirectory },
        )
      }

      parsedConfig = await resolveTemplateStrings(config!, new ProjectConfigContext())
    }

    const projectRoot = parsedConfig.path

    const {
      defaultEnvironment,
      environments,
      name: projectName,
      environmentDefaults,
      sources: projectSources,
    } = parsedConfig.project!

    if (!env) {
      env = defaultEnvironment
    }

    const parts = env.split(".")
    const environmentName = parts[0]
    const namespace = parts.slice(1).join(".") || DEFAULT_NAMESPACE

    const environmentConfig = findByName(environments, environmentName)

    if (!environmentConfig) {
      throw new ParameterError(`Project ${projectName} does not specify environment ${environmentName}`, {
        projectName,
        env,
        definedEnvironments: getNames(environments),
      })
    }

    if (!environmentConfig.providers || environmentConfig.providers.length === 0) {
      throw new ConfigurationError(`Environment '${environmentName}' does not specify any providers`, {
        projectName,
        env,
        environmentConfig,
      })
    }

    if (namespace.startsWith("garden-")) {
      throw new ParameterError(`Namespace cannot start with "garden-"`, {
        environmentConfig,
        namespace,
      })
    }

    const fixedProviders = fixedPlugins.map(name => ({ name }))

    const mergedProviders = merge(
      fixedProviders,
      keyBy(environmentDefaults.providers, "name"),
      keyBy(environmentConfig.providers, "name"),
    )

    // Resolve the project configuration based on selected environment
    const environment: Environment = {
      name: environmentConfig.name,
      providers: Object.values(mergedProviders),
      variables: merge({}, environmentDefaults.variables, environmentConfig.variables),
    }

    const buildDir = await BuildDir.factory(projectRoot)

    // Register log writers
    if (logger) {
      for (const writerConfig of fileWriterConfigs) {
        logger.writers.push(
          await FileWriter.factory({
            level: logger.level,
            root: projectRoot,
            ...writerConfig,
          }),
        )
      }
    }

    const garden = new Garden(
      projectRoot,
      projectName,
      environment,
      projectSources,
      buildDir,
      logger,
    )

    // Register plugins
    for (const plugin of builtinPlugins.concat(plugins)) {
      garden.registerPlugin(plugin)
    }

    // Load configured plugins
    // Validate configuration
    for (const provider of environment.providers) {
      await garden.loadPlugin(provider.name, provider)
    }

    return garden
  }

  getPluginContext(providerName: string) {
    return createPluginContext(this, providerName)
  }

  async clearBuilds() {
    return this.buildDir.clear()
  }

  async addTask(task: Task) {
    await this.taskGraph.addTask(task)
  }

  async processTasks(): Promise<TaskResults> {
    return this.taskGraph.processTasks()
  }

  private registerPlugin(moduleOrFactory: RegisterPluginParam) {
    let factory: PluginFactory
    let name: string

    if (typeof moduleOrFactory === "function") {
      factory = moduleOrFactory
      name = factory.pluginName || factory.name!

    } else if (isString(moduleOrFactory)) {
      let moduleNameOrLocation = moduleOrFactory
      const parsedLocation = parse(moduleNameOrLocation)

      // allow relative references to project root
      if (parse(moduleNameOrLocation).dir !== "") {
        moduleNameOrLocation = resolve(this.projectRoot, moduleNameOrLocation)
      }

      let pluginModule

      try {
        pluginModule = require(moduleNameOrLocation)
      } catch (error) {
        throw new ConfigurationError(
          `Unable to load plugin "${moduleNameOrLocation}" (could not load module: ${error.message})`, {
            message: error.message,
            moduleNameOrLocation,
          })
      }

      try {
        pluginModule = validate(
          pluginModule,
          pluginModuleSchema,
          { context: `plugin module "${moduleNameOrLocation}"` },
        )

        if (pluginModule.name) {
          name = pluginModule.name
        } else {
          if (parsedLocation.name === "index") {
            // use parent directory name
            name = parsedLocation.dir.split(sep).slice(-1)[0]
          } else {
            name = parsedLocation.name
          }
        }

        validate(name, joiIdentifier(), { context: `name of plugin "${moduleNameOrLocation}"` })
      } catch (err) {
        throw new PluginError(`Unable to load plugin: ${err}`, {
          moduleNameOrLocation,
          err,
        })
      }

      factory = pluginModule.gardenPlugin

    } else {
      throw new TypeError(`Expected plugin factory function, module name or module path`)
    }

    this.registeredPlugins[name] = factory
  }

  private async loadPlugin(pluginName: string, config: object) {
    const factory = this.registeredPlugins[pluginName]

    if (!factory) {
      throw new ConfigurationError(`Configured plugin '${pluginName}' has not been registered`, {
        name: pluginName,
        availablePlugins: Object.keys(this.registeredPlugins),
      })
    }

    let plugin

    try {
      plugin = await factory({
        projectName: this.projectName,
        config,
        logEntry: this.log,
      })
    } catch (error) {
      throw new PluginError(`Unexpected error when loading plugin "${pluginName}": ${error}`, {
        pluginName,
        error,
      })
    }

    plugin = validate(plugin, pluginSchema, { context: `plugin "${pluginName}"` })

    this.loadedPlugins[pluginName] = plugin

    // allow plugins to extend their own config (that gets passed to action handlers)
    const providerConfig = findByName(this.environment.providers, pluginName)
    if (providerConfig) {
      extend(providerConfig, plugin.config, config)
    } else {
      this.environment.providers.push(extend({ name: pluginName }, plugin.config, config))
    }

    for (const modulePath of plugin.modules || []) {
      let moduleConfig = await this.resolveModule(modulePath)
      if (!moduleConfig) {
        throw new PluginError(`Could not load module "${modulePath}" specified in plugin "${pluginName}"`, {
          pluginName,
          modulePath,
        })
      }
      moduleConfig.plugin = pluginName
      await this.addModule(moduleConfig)
    }

    const actions = plugin.actions || {}

    for (const actionType of pluginActionNames) {
      const handler = actions[actionType]
      handler && this.addActionHandler(pluginName, actionType, handler)
    }

    const moduleActions = plugin.moduleActions || {}

    for (const moduleType of Object.keys(moduleActions)) {
      for (const actionType of moduleActionNames) {
        const handler = moduleActions[moduleType][actionType]
        handler && this.addModuleActionHandler(pluginName, actionType, moduleType, handler)
      }
    }
  }

  private getPlugin(pluginName: string) {
    const plugin = this.loadedPlugins[pluginName]

    if (!plugin) {
      throw new PluginError(`Could not find plugin ${pluginName}. Are you missing a provider configuration?`, {
        pluginName,
        availablePlugins: Object.keys(this.loadedPlugins),
      })
    }

    return plugin
  }

  private addActionHandler<T extends keyof PluginActions>(
    pluginName: string, actionType: T, handler: PluginActions[T],
  ) {
    const plugin = this.getPlugin(pluginName)
    const schema = pluginActionDescriptions[actionType].resultSchema

    const wrapped = async (...args) => {
      const result = await handler.apply(plugin, args)
      return validate(result, schema, { context: `${actionType} output from plugin ${pluginName}` })
    }
    wrapped["actionType"] = actionType
    wrapped["pluginName"] = pluginName

    this.actionHandlers[actionType][pluginName] = wrapped
  }

  private addModuleActionHandler<T extends keyof ModuleActions>(
    pluginName: string, actionType: T, moduleType: string, handler: ModuleActions[T],
  ) {
    const plugin = this.getPlugin(pluginName)
    const schema = moduleActionDescriptions[actionType].resultSchema

    const wrapped = async (...args) => {
      const result = await handler.apply(plugin, args)
      return validate(result, schema, { context: `${actionType} output from plugin ${pluginName}` })
    }
    wrapped["actionType"] = actionType
    wrapped["pluginName"] = pluginName
    wrapped["moduleType"] = moduleType

    if (!this.moduleActionHandlers[actionType]) {
      this.moduleActionHandlers[actionType] = {}
    }

    if (!this.moduleActionHandlers[actionType][moduleType]) {
      this.moduleActionHandlers[actionType][moduleType] = {}
    }

    this.moduleActionHandlers[actionType][moduleType][pluginName] = wrapped
  }

  /*
    Returns all modules that are registered in this context.
    Scans for modules in the project root if it hasn't already been done.
   */
  async getModules(names?: string[], noScan?: boolean): Promise<Module[]> {
    if (!this.modulesScanned && !noScan) {
      await this.scanModules()
    }

    let configs: ModuleConfig[]

    if (!!names) {
      configs = []
      const missing: string[] = []

      for (const name of names) {
        const module = this.moduleConfigs[name]

        if (!module) {
          missing.push(name)
        } else {
          configs.push(module)
        }
      }

      if (missing.length) {
        throw new ParameterError(`Could not find module(s): ${missing.join(", ")}`, {
          missing,
          available: Object.keys(this.moduleConfigs),
        })
      }
    } else {
      configs = Object.values(this.moduleConfigs)
    }

    return Bluebird.map(configs, config => moduleFromConfig(this, config))
  }

  /**
   * Returns the module with the specified name. Throws error if it doesn't exist.
   */
  async getModule(name: string, noScan?: boolean): Promise<Module> {
    return (await this.getModules([name], noScan))[0]
  }

  /**
   * Given the provided lists of build and service dependencies, return a list of all modules
   * required to satisfy those dependencies.
   */
  async resolveModuleDependencies(buildDependencies: BuildDependencyConfig[], serviceDependencies: string[]) {
    const buildDeps = await Bluebird.map(buildDependencies, async (dep) => {
      const moduleKey = getModuleKey(dep.name, dep.plugin)
      const module = await this.getModule(moduleKey)
      return [module].concat(await this.resolveModuleDependencies(module.build.dependencies, []))
    })

    const runtimeDeps = await Bluebird.map(serviceDependencies, async (serviceName) => {
      const service = await this.getService(serviceName)
      return this.resolveModuleDependencies(
        [{ name: service.module.name, copy: [] }],
        service.config.dependencies || [],
      )
    })

    const deps = flatten(buildDeps).concat(flatten(runtimeDeps))

    return sortBy(uniqBy(deps, "name"), "name")
  }

  /**
   * Given a module, and a list of dependencies, resolve the version for that combination of modules.
   * The combined version is a either the latest dirty module version (if any), or the hash of the module version
   * and the versions of its dependencies (in sorted order).
   */
  async resolveVersion(moduleName: string, moduleDependencies: BuildDependencyConfig[], force = false) {
    const config = this.moduleConfigs[moduleName]
    const cacheKey = ["moduleVersions", moduleName]

    if (!force) {
      const cached = <ModuleVersion>this.cache.get(cacheKey)

      if (cached) {
        return cached
      }
    }

    const dependencyKeys = moduleDependencies.map(dep => getModuleKey(dep.name, dep.plugin))
    const dependencies = Object.values(pickKeys(this.moduleConfigs, dependencyKeys, "module config"))
    const cacheContexts = dependencies.concat([config]).map(c => getModuleCacheContext(c))

    const version = await this.vcs.resolveVersion(config, dependencies)

    this.cache.set(cacheKey, version, ...cacheContexts)
    return version
  }

  /*
    Returns all services that are registered in this context, or the ones specified.
    Scans for modules and services in the project root if it hasn't already been done.
   */
  async getServices(names?: string[], noScan?: boolean): Promise<Service[]> {
    if (!this.modulesScanned && !noScan) {
      await this.scanModules()
    }

    const picked = names ? pickKeys(this.serviceNameIndex, names, "service") : this.serviceNameIndex

    return Bluebird.map(Object.entries(picked), async ([serviceName, moduleName]) => {
      const module = await this.getModule(moduleName)
      const config = findByName(module.serviceConfigs, serviceName)!

      return {
        name: serviceName,
        config,
        module,
        spec: config.spec,
      }
    })
  }

  /**
   * Returns the service with the specified name. Throws error if it doesn't exist.
   */
  async getService(name: string, noScan?: boolean): Promise<Service<Module>> {
    return (await this.getServices([name], noScan))[0]
  }

  /*
    Scans the project root for modules and adds them to the context.
   */
  async scanModules(force = false) {
    return scanLock.acquire("scan-modules", async () => {
      if (this.modulesScanned && !force) {
        return
      }

      let extSourcePaths: string[] = []

      // Add external sources that are defined at the project level. External sources are either kept in
      // the .garden/sources dir (and cloned there if needed), or they're linked to a local path via the link command.
      for (const { name, repositoryUrl } of this.projectSources) {
        const path = await this.loadExtSourcePath({ name, repositoryUrl, sourceType: "project" })
        extSourcePaths.push(path)
      }

      const dirsToScan = [this.projectRoot, ...extSourcePaths]

      const modulePaths = flatten(await Bluebird.map(dirsToScan, async dir => {
        const ignorer = await getIgnorer(dir)
        const scanOpts = {
          filter: (path) => {
            const relPath = relative(this.projectRoot, path)
            return !ignorer.ignores(relPath)
          },
        }
        const paths: string[] = []

        for await (const item of scanDirectory(dir, scanOpts)) {
          if (!item) {
            continue
          }

          const parsedPath = parse(item.path)

          if (parsedPath.base !== MODULE_CONFIG_FILENAME) {
            continue
          }

          paths.push(parsedPath.dir)
        }

        return paths
      })).filter(Boolean)

      await Bluebird.map(modulePaths, async path => {
        const config = await this.resolveModule(path)
        config && await this.addModule(config)
      })

      this.modulesScanned = true

      await this.detectCircularDependencies()

      const moduleConfigContext = new ModuleConfigContext(
        this, this.environment, Object.values(this.moduleConfigs),
      )
      this.moduleConfigs = await resolveTemplateStrings(this.moduleConfigs, moduleConfigContext)
    })
  }

  private async detectCircularDependencies() {
    const modules = await this.getModules()
    const services = await this.getServices()

    return detectCircularDependencies(modules, services)
  }

  /*
    Adds the specified module to the context

    @param force - add the module again, even if it's already registered
   */
  async addModule(config: ModuleConfig, force = false) {
    const validateHandler = await this.getModuleActionHandler({ actionType: "validate", moduleType: config.type })
    const ctx = this.getPluginContext(validateHandler["pluginName"])

    config = await validateHandler({ ctx, moduleConfig: config })

    // FIXME: this is rather clumsy
    config.name = getModuleKey(config.name, config.plugin)

    if (!force && this.moduleConfigs[config.name]) {
      const pathA = relative(this.projectRoot, this.moduleConfigs[config.name].path)
      const pathB = relative(this.projectRoot, config.path)

      throw new ConfigurationError(
        `Module ${config.name} is declared multiple times ('${pathA}' and '${pathB}')`,
        { pathA, pathB },
      )
    }

    this.moduleConfigs[config.name] = config

    // Add to service-module map
    for (const serviceConfig of config.serviceConfigs) {
      const serviceName = serviceConfig.name

      if (!force && this.serviceNameIndex[serviceName]) {
        throw new ConfigurationError(
          `Service names must be unique - ${serviceName} is declared multiple times ` +
          `(in '${this.serviceNameIndex[serviceName]}' and '${config.name}')`,
          {
            serviceName,
            moduleA: this.serviceNameIndex[serviceName],
            moduleB: config.name,
          },
        )
      }

      this.serviceNameIndex[serviceName] = config.name
    }

    if (this.modulesScanned) {
      // need to re-run this if adding modules after initial scan
      await this.detectCircularDependencies()
    }
  }

  /*
    Maps the provided name or locator to a Module. We first look for a module in the
    project with the provided name. If it does not exist, we treat it as a path
    (resolved with the project path as a base path) and attempt to load the module
    from there.
   */
  async resolveModule(nameOrLocation: string): Promise<ModuleConfig | null> {
    const parsedPath = parse(nameOrLocation)

    if (parsedPath.dir === "") {
      // Looks like a name
      const existingModule = this.moduleConfigs[nameOrLocation]

      if (!existingModule) {
        throw new ConfigurationError(`Module ${nameOrLocation} could not be found`, {
          name: nameOrLocation,
        })
      }

      return existingModule
    }

    // Looks like a path
    const path = resolve(this.projectRoot, nameOrLocation)
    const config = await loadConfig(this.projectRoot, path)

    if (!config || !config.module) {
      return null
    }

    const moduleConfig = cloneDeep(config.module)

    if (moduleConfig.repositoryUrl) {
      moduleConfig.path = await this.loadExtSourcePath({
        name: moduleConfig.name,
        repositoryUrl: moduleConfig.repositoryUrl,
        sourceType: "module",
      })
    }

    return moduleConfig
  }

  //===========================================================================
  //region Internal helpers
  //===========================================================================

  /**
   * Clones the project/module source if needed and returns the path (either from .garden/sources or from a local path)
   */
  public async loadExtSourcePath({ name, repositoryUrl, sourceType }: {
    name: string,
    repositoryUrl: string,
    sourceType: ExternalSourceType,
  }): Promise<string> {

    const linkedSources = await getLinkedSources(this, sourceType)

    const linked = findByName(linkedSources, name)

    if (linked) {
      return linked.path
    }

    const path = await this.vcs.ensureRemoteSource({ name, sourceType, url: repositoryUrl, logEntry: this.log })

    return path
  }

  /**
   * Get a handler for the specified action.
   */
  public getActionHandlers<T extends keyof PluginActions>(actionType: T, pluginName?: string): ActionHandlerMap<T> {
    return this.filterActionHandlers(this.actionHandlers[actionType], pluginName)
  }

  /**
   * Get a handler for the specified module action.
   */
  public getModuleActionHandlers<T extends keyof ModuleAndServiceActions>(
    { actionType, moduleType, pluginName }:
      { actionType: T, moduleType: string, pluginName?: string },
  ): ModuleActionHandlerMap<T> {
    return this.filterActionHandlers((this.moduleActionHandlers[actionType] || {})[moduleType], pluginName)
  }

  private filterActionHandlers(handlers, pluginName?: string) {
    // make sure plugin is loaded
    if (!!pluginName) {
      this.getPlugin(pluginName)
    }

    if (handlers === undefined) {
      handlers = {}
    }

    return !pluginName ? handlers : pickBy(handlers, (handler) => handler["pluginName"] === pluginName)
  }

  /**
   * Get the last configured handler for the specified action (and optionally module type).
   */
  public getActionHandler<T extends keyof PluginActions>(
    { actionType, pluginName, defaultHandler }:
      { actionType: T, pluginName?: string, defaultHandler?: PluginActions[T] },
  ): PluginActions[T] {

    const handlers = Object.values(this.getActionHandlers(actionType, pluginName))

    if (handlers.length) {
      return handlers[handlers.length - 1]
    } else if (defaultHandler) {
      defaultHandler["pluginName"] = defaultProvider.name
      return defaultHandler
    }

    const errorDetails = {
      requestedHandlerType: actionType,
      environment: this.environment.name,
      pluginName,
    }

    if (pluginName) {
      throw new PluginError(`Plugin '${pluginName}' does not have a '${actionType}' handler.`, errorDetails)
    } else {
      throw new ParameterError(
        `No '${actionType}' handler configured in environment '${this.environment.name}'. ` +
        `Are you missing a provider configuration?`,
        errorDetails,
      )
    }
  }

  /**
   * Get the last configured handler for the specified action.
   */
  public getModuleActionHandler<T extends keyof ModuleAndServiceActions>(
    { actionType, moduleType, pluginName, defaultHandler }:
      { actionType: T, moduleType: string, pluginName?: string, defaultHandler?: ModuleAndServiceActions[T] },
  ): ModuleAndServiceActions[T] {

    const handlers = Object.values(this.getModuleActionHandlers({ actionType, moduleType, pluginName }))

    if (handlers.length) {
      return handlers[handlers.length - 1]
    } else if (defaultHandler) {
      defaultHandler["pluginName"] = defaultProvider.name
      return defaultHandler
    }

    const errorDetails = {
      requestedHandlerType: actionType,
      requestedModuleType: moduleType,
      environment: this.environment.name,
      pluginName,
    }

    if (pluginName) {
      throw new PluginError(
        `Plugin '${pluginName}' does not have a '${actionType}' handler for module type '${moduleType}'.`,
        errorDetails,
      )
    } else {
      throw new ParameterError(
        `No '${actionType}' handler configured for module type '${moduleType}' in environment ` +
        `'${this.environment.name}'. Are you missing a provider configuration?`,
        errorDetails,
      )
    }
  }

  //endregion
}
