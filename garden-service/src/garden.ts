/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import deline = require("deline")
import {
  parse,
  relative,
  resolve,
  sep,
} from "path"
import {
  extend,
  flatten,
  intersection,
  isString,
  fromPairs,
  merge,
  keyBy,
  cloneDeep,
  pick,
  pickBy,
  sortBy,
  difference,
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
} from "./types/plugin/plugin"
import { Environment, SourceConfig, defaultProvider, Provider } from "./config/project"
import {
  findByName,
  getIgnorer,
  getNames,
  scanDirectory,
  pickKeys,
  throwOnMissingNames,
  uniqByName,
} from "./util/util"
import {
  DEFAULT_NAMESPACE,
  MODULE_CONFIG_FILENAME,
} from "./constants"
import {
  ConfigurationError,
  ParameterError,
  PluginError,
  RuntimeError,
} from "./exceptions"
import { VcsHandler, ModuleVersion } from "./vcs/base"
import { GitHandler } from "./vcs/git"
import { BuildDir } from "./build-dir"
import { HotReloadHandler, HotReloadScheduler } from "./hotReloadScheduler"
import { DependencyGraph } from "./dependency-graph"
import {
  TaskGraph,
  TaskResults,
} from "./task-graph"
import {
  getLogger,
} from "./logger/logger"
import {
  pluginActionNames,
  PluginActions,
  PluginFactory,
  GardenPlugin,
  ModuleActions,
} from "./types/plugin/plugin"
import { joiIdentifier, validate, PrimitiveMap } from "./config/common"
import { Service } from "./types/service"
import { Task } from "./types/task"
import { resolveTemplateStrings } from "./template-string"
import {
  configSchema,
  GardenConfig,
  loadConfig,
  findProjectConfig,
} from "./config/base"
import { BaseTask } from "./tasks/base"
import { LocalConfigStore } from "./config-store"
import { detectCircularDependencies } from "./util/detectCycles"
import {
  getLinkedSources,
  ExternalSourceType,
} from "./util/ext-source-util"
import { BuildDependencyConfig, ModuleConfig } from "./config/module"
import { ProjectConfigContext, ModuleConfigContext } from "./config/config-context"
import { ActionHelper } from "./actions"
import { createPluginContext } from "./plugin-context"
import { ModuleAndRuntimeActions, Plugins, RegisterPluginParam } from "./types/plugin/plugin"
import { SUPPORTED_PLATFORMS, SupportedPlatform } from "./constants"
import { platform, arch } from "os"
import { LogEntry } from "./logger/log-entry"
import { EventBus } from "./events"

export interface ActionHandlerMap<T extends keyof PluginActions> {
  [actionName: string]: PluginActions[T]
}

export interface ModuleActionHandlerMap<T extends keyof ModuleAndRuntimeActions> {
  [actionName: string]: ModuleAndRuntimeActions[T]
}

export type PluginActionMap = {
  [A in keyof PluginActions]: {
    [pluginName: string]: PluginActions[A],
  }
}

export type ModuleActionMap = {
  [A in keyof ModuleAndRuntimeActions]: {
    [moduleType: string]: {
      [pluginName: string]: ModuleAndRuntimeActions[A],
    },
  }
}

export interface GardenOpts {
  config?: GardenConfig,
  environmentName?: string,
  log?: LogEntry,
  plugins?: Plugins,
}

const scanLock = new AsyncLock()

export class Garden {
  public readonly log: LogEntry
  public readonly actionHandlers: PluginActionMap
  public readonly moduleActionHandlers: ModuleActionMap
  public dependencyGraph: DependencyGraph

  private readonly loadedPlugins: { [key: string]: GardenPlugin }
  private moduleConfigs: ModuleConfigMap
  private modulesScanned: boolean
  private readonly registeredPlugins: { [key: string]: PluginFactory }
  private readonly serviceNameIndex: { [key: string]: string } // service name -> module name
  private readonly taskNameIndex: { [key: string]: string } // task name -> module name
  private readonly hotReloadScheduler: HotReloadScheduler
  private readonly taskGraph: TaskGraph

  public readonly environment: Environment
  public readonly localConfigStore: LocalConfigStore
  public readonly vcs: VcsHandler
  public readonly cache: TreeCache
  public readonly actions: ActionHelper
  public readonly events: EventBus

  constructor(
    public readonly projectRoot: string,
    public readonly projectName: string,
    environmentName: string,
    variables: PrimitiveMap,
    public readonly projectSources: SourceConfig[] = [],
    public readonly buildDir: BuildDir,
    public readonly opts: GardenOpts,
  ) {
    // make sure we're on a supported platform
    const currentPlatform = platform()
    const currentArch = arch()

    if (!SUPPORTED_PLATFORMS.includes(<SupportedPlatform>currentPlatform)) {
      throw new RuntimeError(`Unsupported platform: ${currentPlatform}`, { platform: currentPlatform })
    }

    if (currentArch !== "x64") {
      throw new RuntimeError(`Unsupported CPU architecture: ${currentArch}`, { arch: currentArch })
    }

    this.modulesScanned = false
    this.log = opts.log || getLogger().placeholder()
    // TODO: Support other VCS options.
    this.vcs = new GitHandler(this.projectRoot)
    this.localConfigStore = new LocalConfigStore(this.projectRoot)
    this.cache = new TreeCache()

    this.environment = {
      name: environmentName,
      // The providers are populated when adding plugins in the factory.
      providers: [],
      variables,
    }

    this.moduleConfigs = {}
    this.serviceNameIndex = {}
    this.taskNameIndex = {}
    this.loadedPlugins = {}
    this.registeredPlugins = {}
    this.actionHandlers = <PluginActionMap>fromPairs(pluginActionNames.map(n => [n, {}]))
    this.moduleActionHandlers = <ModuleActionMap>fromPairs(moduleActionNames.map(n => [n, {}]))

    this.taskGraph = new TaskGraph(this, this.log)
    this.actions = new ActionHelper(this)
    this.hotReloadScheduler = new HotReloadScheduler()
    this.events = new EventBus()
  }

  static async factory<T extends typeof Garden>(
    this: T, currentDirectory: string, opts: GardenOpts = {},
  ): Promise<InstanceType<T>> {
    let parsedConfig: GardenConfig
    let { environmentName, config, plugins = {} } = opts

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

    if (!environmentName) {
      environmentName = defaultEnvironment
    }

    const parts = environmentName.split(".")
    environmentName = parts[0]
    const namespace = parts.slice(1).join(".") || DEFAULT_NAMESPACE

    const environmentConfig = findByName(environments, environmentName)

    if (!environmentConfig) {
      throw new ParameterError(`Project ${projectName} does not specify environment ${environmentName}`, {
        projectName,
        environmentName,
        definedEnvironments: getNames(environments),
      })
    }

    if (!environmentConfig.providers || environmentConfig.providers.length === 0) {
      throw new ConfigurationError(`Environment '${environmentName}' does not specify any providers`, {
        projectName,
        environmentName,
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

    const mergedProviderConfigs = merge(
      fixedProviders,
      keyBy(environmentDefaults.providers, "name"),
      keyBy(environmentConfig.providers, "name"),
    )

    const variables = merge({}, environmentDefaults.variables, environmentConfig.variables)

    const buildDir = await BuildDir.factory(projectRoot)

    const garden = new this(
      projectRoot,
      projectName,
      environmentName,
      variables,
      projectSources,
      buildDir,
      opts,
    ) as InstanceType<T>

    // Register plugins
    for (const [name, pluginFactory] of Object.entries({ ...builtinPlugins, ...plugins })) {
      // This cast is required for the linter to accept the instance type hackery.
      (<Garden>garden).registerPlugin(name, pluginFactory)
    }

    // Load configured plugins
    // Validate configuration
    for (const provider of Object.values(mergedProviderConfigs)) {
      await (<Garden>garden).loadPlugin(provider.name, provider)
    }

    return garden
  }

  getPluginContext(providerName: string) {
    return createPluginContext(this, providerName)
  }

  async clearBuilds() {
    return this.buildDir.clear()
  }

  async addTask(task: BaseTask) {
    await this.taskGraph.addTask(task)
  }

  async processTasks(): Promise<TaskResults> {
    return this.taskGraph.processTasks()
  }

  async hotReload(moduleName: string, hotReloadHandler: HotReloadHandler) {
    return this.hotReloadScheduler.requestHotReload(moduleName, hotReloadHandler)
  }

  private registerPlugin(name: string, moduleOrFactory: RegisterPluginParam) {
    let factory: PluginFactory

    if (typeof moduleOrFactory === "function") {
      factory = moduleOrFactory

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
        log: this.log,
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
      const provider: Provider = {
        name: pluginName,
        config: extend({ name: pluginName }, plugin.config, config),
      }
      this.environment.providers.push(provider)
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

  async getDependencyGraph() {
    if (!this.dependencyGraph) {
      this.dependencyGraph = await DependencyGraph.factory(this)
    }

    return this.dependencyGraph
  }

  /**
   * Given the provided lists of build and runtime (service/task) dependencies, return a list of all
   * modules required to satisfy those dependencies.
   */
  async resolveDependencyModules(
    buildDependencies: BuildDependencyConfig[], runtimeDependencies: string[],
  ): Promise<Module[]> {
    const moduleNames = buildDependencies.map(d => getModuleKey(d.name, d.plugin))
    const dg = await this.getDependencyGraph()

    const serviceNames = runtimeDependencies.filter(d => this.serviceNameIndex[d])
    const taskNames = runtimeDependencies.filter(d => this.taskNameIndex[d])

    const buildDeps = await dg.getDependenciesForMany("build", moduleNames, true)
    const serviceDeps = await dg.getDependenciesForMany("service", serviceNames, true)
    const taskDeps = await dg.getDependenciesForMany("task", taskNames, true)

    const modules = [
      ...(await this.getModules(moduleNames)),
      ...(await dg.modulesForRelations(await dg.mergeRelations(buildDeps, serviceDeps, taskDeps))),
    ]

    return sortBy(uniqByName(modules), "name")
  }

  /**
   * Given a module, and a list of dependencies, resolve the version for that combination of modules.
   * The combined version is a either the latest dirty module version (if any), or the hash of the module version
   * and the versions of its dependencies (in sorted order).
   */
  async resolveVersion(moduleName: string, moduleDependencies: (Module | BuildDependencyConfig)[], force = false) {
    const depModuleNames = moduleDependencies.map(m => m.name)
    depModuleNames.sort()
    const cacheKey = ["moduleVersions", moduleName, ...depModuleNames]

    if (!force) {
      const cached = <ModuleVersion>this.cache.get(cacheKey)

      if (cached) {
        return cached
      }
    }

    const config = this.moduleConfigs[moduleName]
    const dependencyKeys = moduleDependencies.map(dep => getModuleKey(dep.name, dep.plugin))
    const dependencies = Object.values(pickKeys(this.moduleConfigs, dependencyKeys, "module config"))
    const cacheContexts = dependencies.concat([config]).map(c => getModuleCacheContext(c))

    const version = await this.vcs.resolveVersion(config, dependencies)

    this.cache.set(cacheKey, version, ...cacheContexts)
    return version
  }

  async getServiceOrTask(name: string, noScan?: boolean): Promise<Service<Module> | Task<Module>> {
    const service = (await this.getServices([name], noScan))[0]
    const task = (await this.getTasks([name], noScan))[0]

    if (!service && !task) {
      throw new ParameterError(`Could not find service or task named ${name}`, {
        missing: [name],
        availableServices: Object.keys(this.serviceNameIndex),
        availableTasks: Object.keys(this.taskNameIndex),
      })
    }

    return service || task
  }

  /**
   * Returns the service with the specified name. Throws error if it doesn't exist.
   */
  async getService(name: string, noScan?: boolean): Promise<Service<Module>> {
    const service = (await this.getServices([name], noScan))[0]

    if (!service) {
      throw new ParameterError(`Could not find service ${name}`, {
        missing: [name],
        available: Object.keys(this.serviceNameIndex),
      })
    }

    return service
  }

  async getTask(name: string, noScan?: boolean): Promise<Task> {
    const task = (await this.getTasks([name], noScan))[0]

    if (!task) {
      throw new ParameterError(`Could not find task ${name}`, {
        missing: [name],
        available: Object.keys(this.taskNameIndex),
      })
    }

    return task
  }

  /*
    Returns all services that are registered in this context, or the ones specified.
    If the names parameter is used and task names are included in it, they will be
    ignored. Scans for modules and services in the project root if it hasn't already
    been done.
   */
  async getServices(names?: string[], noScan?: boolean): Promise<Service[]> {
    const services = (await this.getServicesAndTasks(names, noScan)).services
    if (names) {
      const taskNames = Object.keys(this.taskNameIndex)
      throwOnMissingNames(difference(names, taskNames), services, "service")
    }
    return services
  }

  /*
    Returns all tasks that are registered in this context, or the ones specified.
    If the names parameter is used and service names are included in it, they will be
    ignored. Scans for modules and services in the project root if it hasn't already
    been done.
   */
  async getTasks(names?: string[], noScan?: boolean): Promise<Task[]> {
    const tasks = (await this.getServicesAndTasks(names, noScan)).tasks
    if (names) {
      const serviceNames = Object.keys(this.serviceNameIndex)
      throwOnMissingNames(difference(names, serviceNames), tasks, "task")
    }
    return tasks
  }

  async getServicesAndTasks(names?: string[], noScan?: boolean) {
    if (!this.modulesScanned && !noScan) {
      await this.scanModules()
    }

    let pickedServices: { [key: string]: string }
    let pickedTasks: { [key: string]: string }

    if (names) {
      const serviceNames = Object.keys(this.serviceNameIndex)
      const taskNames = Object.keys(this.taskNameIndex)
      pickedServices = pick(this.serviceNameIndex, intersection(names, serviceNames))
      pickedTasks = pick(this.taskNameIndex, intersection(names, taskNames))
    } else {
      pickedServices = this.serviceNameIndex
      pickedTasks = this.taskNameIndex
    }

    return Bluebird.props({

      services: Bluebird.map(Object.entries(pickedServices), async ([serviceName, moduleName]):
        Promise<Service> => {

        const module = await this.getModule(moduleName)
        const config = findByName(module.serviceConfigs, serviceName)!

        return {
          name: serviceName,
          config,
          module,
          spec: config.spec,
        }

      }),

      tasks: Bluebird.map(Object.entries(pickedTasks), async ([taskName, moduleName]):
        Promise<Task> => {

        const module = await this.getModule(moduleName)
        const config = findByName(module.taskConfigs, taskName)!

        return {
          name: taskName,
          config,
          module,
          spec: config.spec,
        }

      }),

    })

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
            const relPath = relative(dir, path)
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

      const moduleConfigContext = new ModuleConfigContext(
        this, this.log, this.environment, Object.values(this.moduleConfigs),
      )
      this.moduleConfigs = await resolveTemplateStrings(this.moduleConfigs, moduleConfigContext)

      await this.detectCircularDependencies()
    })
  }

  private async detectCircularDependencies() {
    return detectCircularDependencies(Object.values(this.moduleConfigs))
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
        throw new ConfigurationError(deline`
          Service names must be unique - the service name ${serviceName} is declared multiple times
          (in '${this.serviceNameIndex[serviceName]}' and '${config.name}')`,
          {
            serviceName,
            moduleA: this.serviceNameIndex[serviceName],
            moduleB: config.name,
          },
        )
      }

      this.serviceNameIndex[serviceName] = config.name
    }

    // Add to task-module map
    for (const taskConfig of config.taskConfigs) {
      const taskName = taskConfig.name

      if (!force) {

        if (this.serviceNameIndex[taskName]) {
          throw new ConfigurationError(deline`
            Service and task names must be mutually unique - the task name ${taskName} (declared in
            '${config.name}') is also declared as a service name in '${this.serviceNameIndex[taskName]}'`,
            {
              conflictingName: taskName,
              moduleA: config.name,
              moduleB: this.serviceNameIndex[taskName],
            })
        }

        if (this.taskNameIndex[taskName]) {
          throw new ConfigurationError(deline`
            Task names must be unique - the task name ${taskName} is declared multiple times (in
            '${this.taskNameIndex[taskName]}' and '${config.name}')`,
            {
              taskName,
              moduleA: config.name,
              moduleB: this.serviceNameIndex[taskName],
            })
        }

      }

      this.taskNameIndex[taskName] = config.name

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

    const path = await this.vcs.ensureRemoteSource({ name, sourceType, url: repositoryUrl, log: this.log })

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
  public getModuleActionHandlers<T extends keyof ModuleAndRuntimeActions>(
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
  public getModuleActionHandler<T extends keyof ModuleAndRuntimeActions>(
    { actionType, moduleType, pluginName, defaultHandler }:
      { actionType: T, moduleType: string, pluginName?: string, defaultHandler?: ModuleAndRuntimeActions[T] },
  ): ModuleAndRuntimeActions[T] {

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

  public async dumpConfig(): Promise<ConfigDump> {
    const modules = await this.getModules()

    // Remove circular references and superfluous keys.
    for (const module of modules) {
      delete module._ConfigType

      for (const service of module.services) {
        delete service.module
      }
      for (const task of module.tasks) {
        delete task.module
      }
    }

    return {
      environmentName: this.environment.name,
      providers: this.environment.providers,
      variables: this.environment.variables,
      modules: sortBy(modules, "name"),
    }
  }

  //endregion
}

export interface ConfigDump {
  environmentName: string
  providers: Provider[]
  variables: PrimitiveMap
  modules: Module[]
}
