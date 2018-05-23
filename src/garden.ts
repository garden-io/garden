/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  parse,
  relative,
  resolve,
  sep,
} from "path"
import {
  extend,
  isString,
  values,
  fromPairs,
  merge,
  pick,
  keyBy,
} from "lodash"
import * as Joi from "joi"
import {
  PluginContext,
  createPluginContext,
} from "./plugin-context"
import {
  builtinPlugins,
  fixedPlugins,
} from "./plugins"
import {
  Module,
  ModuleConfig,
  ModuleConfigType,
} from "./types/module"
import {
  moduleActionNames,
  pluginModuleSchema,
  pluginSchema,
  RegisterPluginParam,
} from "./types/plugin"
import { EnvironmentConfig } from "./types/project"
import {
  findByName,
  getIgnorer,
  getNames,
  scanDirectory,
} from "./util"
import {
  DEFAULT_NAMESPACE,
  MODULE_CONFIG_FILENAME,
} from "./constants"
import {
  ConfigurationError,
  ParameterError,
  PluginError,
} from "./exceptions"
import { VcsHandler } from "./vcs/base"
import { GitHandler } from "./vcs/git"
import { BuildDir } from "./build-dir"
import {
  TaskGraph,
  TaskResults,
} from "./task-graph"
import {
  getLogger,
  RootLogNode,
} from "./logger"
import {
  pluginActionNames,
  PluginActions,
  PluginFactory,
  GardenPlugin,
  ModuleActions,
} from "./types/plugin"
import {
  Environment,
  joiIdentifier,
  validate,
} from "./types/common"
import { Service } from "./types/service"
import {
  TemplateStringContext,
  getTemplateContext,
  resolveTemplateStrings,
} from "./template-string"
import {
  configSchema,
  GardenConfig,
  loadConfig,
} from "./types/config"
import { Task } from "./types/task"
import {
  LocalConfigStore,
} from "./config-store"
import { detectCircularDependencies } from "./util/detectCycles"

export interface ModuleMap<T extends Module> {
  [key: string]: T
}

export interface ServiceMap<T extends Module = Module> {
  [key: string]: Service<T>
}

export interface ActionHandlerMap<T extends keyof PluginActions> {
  [actionName: string]: PluginActions[T]
}

export interface ModuleActionHandlerMap<T extends keyof ModuleActions<any>> {
  [actionName: string]: ModuleActions<any>[T]
}

export type PluginActionMap = {
  [A in keyof PluginActions]: {
    [pluginName: string]: PluginActions[A],
  }
}

export type ModuleActionMap = {
  [A in keyof ModuleActions<any>]: {
    [pluginName: string]: ModuleActions<any>[A],
  }
}

export interface ContextOpts {
  config?: GardenConfig,
  env?: string,
  logger?: RootLogNode,
  plugins?: RegisterPluginParam[],
}

export class Garden {
  public buildDir: BuildDir
  public readonly log: RootLogNode
  public readonly actionHandlers: PluginActionMap
  public readonly moduleActionHandlers: ModuleActionMap
  public readonly pluginContext: PluginContext

  private readonly loadedPlugins: { [key: string]: GardenPlugin }
  private readonly modules: ModuleMap<any>
  private modulesScanned: boolean
  private readonly registeredPlugins: { [key: string]: PluginFactory }
  private readonly services: ServiceMap
  private taskGraph: TaskGraph
  private readonly configKeyNamespaces: string[]

  vcs: VcsHandler

  constructor(
    public readonly projectRoot: string,
    public readonly projectName: string,
    private readonly environment: string,
    private readonly namespace: string,
    public readonly config: EnvironmentConfig,
    public readonly localConfigStore: LocalConfigStore,
    logger?: RootLogNode,
  ) {
    this.modulesScanned = false
    this.log = logger || getLogger()
    // TODO: Support other VCS options.
    this.vcs = new GitHandler(this.projectRoot)
    this.buildDir = new BuildDir(this.projectRoot)

    this.modules = {}
    this.services = {}
    this.loadedPlugins = {}
    this.registeredPlugins = {}
    this.actionHandlers = <PluginActionMap>fromPairs(pluginActionNames.map(n => [n, {}]))
    this.moduleActionHandlers = <ModuleActionMap>fromPairs(moduleActionNames.map(n => [n, {}]))

    this.buildDir.init()

    this.config = config

    this.configKeyNamespaces = ["project"]

    this.pluginContext = createPluginContext(this)
    this.taskGraph = new TaskGraph(this.pluginContext)
  }

  static async factory(projectRoot: string, { env, config, logger, plugins = [] }: ContextOpts = {}) {
    let parsedConfig: GardenConfig

    const localConfigStore = new LocalConfigStore(projectRoot)

    if (config) {
      parsedConfig = <GardenConfig>validate(config, configSchema, { context: "root configuration" })

      if (!parsedConfig.project) {
        throw new ConfigurationError(`Supplied config does not contain a project configuration`, {
          projectRoot,
          config,
        })
      }
    } else {
      config = await loadConfig(projectRoot, projectRoot)
      const templateContext = await getTemplateContext()
      parsedConfig = await resolveTemplateStrings(config, templateContext)

      if (!parsedConfig.project) {
        throw new ConfigurationError(`Path ${projectRoot} does not contain a project configuration`, {
          projectRoot,
          config,
        })
      }
    }

    if (!env) {
      env = parsedConfig.project.defaultEnvironment
    }

    const projectName = parsedConfig.project.name
    const globalConfig = parsedConfig.project.global || {}

    const parts = env.split(".")
    const environment = parts[0]
    const namespace = parts.slice(1).join(".") || DEFAULT_NAMESPACE

    const envConfig = findByName(parsedConfig.project.environments, environment)

    if (!envConfig) {
      throw new ParameterError(`Project ${projectName} does not specify environment ${environment}`, {
        projectName,
        env,
        definedEnvironments: getNames(parsedConfig.project.environments),
      })
    }

    if (!envConfig.providers || envConfig.providers.length === 0) {
      throw new ConfigurationError(`Environment '${environment}' does not specify any providers`, {
        projectName,
        env,
        envConfig,
      })
    }

    if (namespace.startsWith("garden-")) {
      throw new ParameterError(`Namespace cannot start with "garden-"`, {
        environment,
        namespace,
      })
    }

    const mergedProviders = merge(
      {},
      keyBy(globalConfig.providers, "name"),
      keyBy(envConfig.providers, "name"),
    )

    // Resolve the project configuration based on selected environment
    const projectEnvConfig: EnvironmentConfig = {
      name: environment,
      providers: values(mergedProviders),
      variables: merge({}, globalConfig.variables, envConfig.variables),
    }

    const garden = new Garden(
      projectRoot, projectName,
      environment, namespace,
      projectEnvConfig,
      localConfigStore,
      logger,
    )

    // Register plugins
    for (const plugin of builtinPlugins.concat(plugins)) {
      garden.registerPlugin(plugin)
    }

    for (const plugin of fixedPlugins) {
      await garden.loadPlugin(plugin, {})
    }

    // Load configured plugins
    // Validate configuration
    for (const provider of projectEnvConfig.providers) {
      await garden.loadPlugin(provider.name, provider)
    }

    return garden
  }

  getEnvironment(): Environment {
    return {
      name: this.environment,
      namespace: this.namespace,
      config: this.config,
    }
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
        throw new ConfigurationError(`Unable to load plugin "${moduleNameOrLocation}" (could not load module)`, {
          error,
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
      plugin = factory({
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
    if (plugin.config) {
      const providerConfig = findByName(this.config.providers, pluginName)
      if (providerConfig) {
        extend(providerConfig, plugin.config)
      } else {
        this.config.providers.push(plugin.config)
      }
    }

    for (const modulePath of plugin.modules || []) {
      const module = await this.resolveModule(modulePath)
      if (!module) {
        throw new PluginError(`Could not load module "${modulePath}" specified in plugin "${pluginName}"`, {
          pluginName,
          modulePath,
        })
      }
      module.name = `${pluginName}.${module.name}`
      module.updateConfig("name", module.name)
      await this.addModule(module)
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
      throw new PluginError(`Could not find plugin ${pluginName}`, {
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

    const wrapped = (...args) => {
      return handler.apply(plugin, args)
    }
    wrapped["actionType"] = actionType
    wrapped["pluginName"] = pluginName

    this.actionHandlers[actionType][pluginName] = wrapped
  }

  private addModuleActionHandler<T extends keyof ModuleActions<any>>(
    pluginName: string, actionType: T, moduleType: string, handler: ModuleActions<any>[T],
  ) {
    const plugin = this.getPlugin(pluginName)

    const wrapped = (...args) => {
      return handler.apply(plugin, args)
    }
    wrapped["actionType"] = actionType
    wrapped["pluginName"] = pluginName
    wrapped["moduleType"] = moduleType

    if (!this.moduleActionHandlers[moduleType]) {
      this.moduleActionHandlers[moduleType] = {}
    }

    if (!this.moduleActionHandlers[moduleType][actionType]) {
      this.moduleActionHandlers[moduleType][actionType] = {}
    }

    this.moduleActionHandlers[moduleType][actionType][pluginName] = wrapped
  }

  /*
    Returns all modules that are registered in this context.
    Scans for modules in the project root if it hasn't already been done.
   */
  async getModules(names?: string[], noScan?: boolean): Promise<Module[]> {
    if (!this.modulesScanned && !noScan) {
      await this.scanModules()
    }

    if (!names) {
      return values(this.modules)
    }

    const output: Module[] = []
    const missing: string[] = []

    for (const name of names) {
      const module = this.modules[name]

      if (!module) {
        missing.push(name)
      } else {
        output.push(module)
      }
    }

    if (missing.length) {
      throw new ParameterError(`Could not find module(s): ${missing.join(", ")}`, {
        missing,
        available: Object.keys(this.modules),
      })
    }

    return output
  }

  /**
   * Returns the module with the specified name. Throws error if it doesn't exist.
   */
  async getModule(name: string, noScan?: boolean): Promise<Module<ModuleConfig>> {
    return (await this.getModules([name], noScan))[0]
  }

  /*
    Returns all services that are registered in this context.
    Scans for modules and services in the project root if it hasn't already been done.
   */
  async getServices(names?: string[], noScan?: boolean): Promise<Service[]> {
    // TODO: deduplicate (this is almost the same as getModules()
    if (!this.modulesScanned && !noScan) {
      await this.scanModules()
    }

    if (!names) {
      return values(this.services)
    }

    const output: Service[] = []
    const missing: string[] = []

    for (const name of names) {
      const service = this.services[name]

      if (!service) {
        missing.push(name)
      } else {
        output.push(service)
      }
    }

    if (missing.length) {
      throw new ParameterError(`Could not find service(s): ${missing.join(", ")}`, {
        missing,
        available: Object.keys(this.services),
      })
    }

    return output
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
  async scanModules() {
    const ignorer = getIgnorer(this.projectRoot)
    const scanOpts = {
      filter: (path) => {
        const relPath = relative(this.projectRoot, path)
        return !ignorer.ignores(relPath)
      },
    }
    const modulePaths: string[] = []

    for await (const item of scanDirectory(this.projectRoot, scanOpts)) {
      if (!item) {
        continue
      }

      const parsedPath = parse(item.path)

      if (parsedPath.base !== MODULE_CONFIG_FILENAME) {
        continue
      }

      modulePaths.push(parsedPath.dir)
    }

    for (const path of modulePaths) {
      const module = await this.resolveModule(path)
      module && await this.addModule(module)
    }

    this.modulesScanned = true

    await detectCircularDependencies(
      await this.getModules(),
      (await this.getServices()).map(s => s.name))
  }

  /*
    Adds the specified module to the context

    @param force - add the module again, even if it's already registered
   */
  async addModule(module: Module, force = false) {
    const config = await module.getConfig()

    if (!force && this.modules[config.name]) {
      const pathA = relative(this.projectRoot, this.modules[config.name].path)
      const pathB = relative(this.projectRoot, module.path)

      throw new ConfigurationError(
        `Module ${config.name} is declared multiple times ('${pathA}' and '${pathB}')`,
        { pathA, pathB },
      )
    }

    this.modules[config.name] = module

    // Add to service-module map
    for (const service of config.services || []) {
      const serviceName = service.name

      if (!force && this.services[serviceName]) {
        throw new ConfigurationError(
          `Service names must be unique - ${serviceName} is declared multiple times ` +
          `(in '${this.services[serviceName].module.name}' and '${config.name}')`,
          {
            serviceName,
            moduleA: this.services[serviceName].module.name,
            moduleB: config.name,
          },
        )
      }

      this.services[serviceName] = await Service.factory(this.pluginContext, module, serviceName)
    }
  }

  /*
    Maps the provided name or locator to a Module. We first look for a module in the
    project with the provided name. If it does not exist, we treat it as a path
    (resolved with the project path as a base path) and attempt to load the module
    from there.

    // TODO: support git URLs
   */
  async resolveModule<T extends Module = Module>(nameOrLocation: string): Promise<T | null> {
    const parsedPath = parse(nameOrLocation)

    if (parsedPath.dir === "") {
      // Looks like a name
      const module = this.modules[nameOrLocation]

      if (!module) {
        throw new ConfigurationError(`Module ${nameOrLocation} could not be found`, {
          name: nameOrLocation,
        })
      }

      return <T>module
    }

    // Looks like a path
    const path = resolve(this.projectRoot, nameOrLocation)
    const config = await loadConfig(this.projectRoot, path)
    const moduleConfig = <ModuleConfigType<T>>config.module

    if (!moduleConfig) {
      return null
    }

    return this.pluginContext.parseModule(moduleConfig)
  }

  async getTemplateContext(extraContext: TemplateStringContext = {}): Promise<TemplateStringContext> {
    const _this = this

    return {
      ...await getTemplateContext(),
      config: async (key: string[]) => {
        return _this.pluginContext.getConfig(key)
      },
      variables: this.config.variables,
      environment: { name: this.environment, config: <any>this.config },
      ...extraContext,
    }
  }

  //===========================================================================
  //region Internal helpers
  //===========================================================================

  /**
   * Get a list of names of all configured plugins for the currently set environment.
   * Includes built-in module handlers (used for builds and such).
   */
  private getEnvPlugins() {
    return Object.keys(this.loadedPlugins)
  }

  /**
   * Get a handler for the specified action.
   */
  public getActionHandlers<T extends keyof PluginActions>(actionType: T): ActionHandlerMap<T> {
    return pick(this.actionHandlers[actionType], this.getEnvPlugins())
  }

  /**
   * Get a handler for the specified module action.
   */
  public getModuleActionHandlers<T extends keyof ModuleActions<any>>(
    actionType: T, moduleType: string,
  ): ModuleActionHandlerMap<T> {
    return pick((this.moduleActionHandlers[moduleType] || {})[actionType], this.getEnvPlugins())
  }

  /**
   * Get the last configured handler for the specified action (and optionally module type).
   */
  public getActionHandler<T extends keyof PluginActions>(
    type: T, defaultHandler?: PluginActions[T],
  ): PluginActions[T] {

    const handlers = values(this.getActionHandlers(type))

    if (handlers.length) {
      return handlers[handlers.length - 1]
    } else if (defaultHandler) {
      return defaultHandler
    }

    // TODO: Make these error messages nicer
    throw new ParameterError(
      `No '${type}' handler configured in environment '${this.environment}'. ` +
      `Are you missing a provider configuration?`,
      {
        requestedHandlerType: type,
        environment: this.environment,
      },
    )
  }

  /**
   * Get the last configured handler for the specified action.
   */
  public getModuleActionHandler<T extends keyof ModuleActions<any>>(
    type: T, moduleType: string, defaultHandler?: ModuleActions<any>[T],
  ): ModuleActions<any>[T] {

    const handlers = values(this.getModuleActionHandlers(type, moduleType))

    if (handlers.length) {
      return handlers[handlers.length - 1]
    } else if (defaultHandler) {
      return defaultHandler
    }

    // TODO: Make these error messages nicer
    throw new ParameterError(
      `No '${type}' handler configured for module type '${moduleType}' in environment '${this.environment}'. ` +
      `Are you missing a provider configuration?`,
      {
        requestedHandlerType: type,
        requestedModuleType: moduleType,
        environment: this.environment,
      },
    )
  }

  /**
   * Validates the specified config key, making sure it's properly formatted and matches defined keys.
   */
  public validateConfigKey(key: string[]) {
    try {
      validate(key, Joi.array().items(joiIdentifier()))
    } catch (err) {
      throw new ParameterError(
        `Invalid config key: ${key.join(".")} (must be a dot delimited string of identifiers)`,
        { key },
      )
    }

    if (!this.configKeyNamespaces.includes(key[0])) {
      throw new ParameterError(
        `Invalid config key namespace ${key[0]} (must be one of ${this.configKeyNamespaces.join(", ")})`,
        { key, validNamespaces: this.configKeyNamespaces },
      )
    }

    if (key[0] === "project") {
      // we allow any custom key under the project namespace
      return
    } else {
      // TODO: validate built-in (garden) and plugin config keys
    }
  }

  //endregion
}
