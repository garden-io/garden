import { parse, relative, resolve } from "path"
import Bluebird = require("bluebird")
import { values, mapValues } from "lodash"
import * as Joi from "joi"
import { loadModuleConfig, Module, TestSpec } from "./types/module"
import { loadProjectConfig, ProjectConfig } from "./types/project-config"
import { getIgnorer, scanDirectory } from "./util"
import { DEFAULT_NAMESPACE, MODULE_CONFIG_FILENAME } from "./constants"
import { ConfigurationError, ParameterError, PluginError } from "./exceptions"
import { VcsHandler } from "./vcs/base"
import { GitHandler } from "./vcs/git"
import { Task, TaskGraph } from "./task-graph"
import { getLogger, LogEntry, RootLogNode } from "./logger"
import {
  BuildStatus, pluginActionNames, PluginActions, PluginFactory, Plugin,
} from "./types/plugin"
import { GenericModuleHandler } from "./plugins/generic"
import { Environment, joiIdentifier } from "./types/common"
import { Service, ServiceContext } from "./types/service"
import { TemplateStringContext, getTemplateContext, resolveTemplateStrings } from "./template-string"

interface ModuleMap { [key: string]: Module }
interface ServiceMap { [key: string]: Service<any> }
interface ActionHandlerMap<T extends keyof PluginActions<any>> { [key: string]: PluginActions<any>[T] }

type PluginActionMap = {
  [A in keyof PluginActions<any>]: {
    [pluginName: string]: PluginActions<any>[A],
  }
}

interface ContextOpts {
  logger?: RootLogNode,
  plugins?: PluginFactory[],
}

const builtinPlugins: PluginFactory[] = [
  () => new GenericModuleHandler(),
]

export class GardenContext {
  public readonly log: RootLogNode
  public readonly actionHandlers: PluginActionMap
  public readonly projectName: string
  public readonly plugins: { [key: string]: Plugin<any> }

  // TODO: We may want to use the _ prefix for private properties even if it's not idiomatic TS,
  // because we're supporting plain-JS plugins as well.
  private environment: string
  private namespace: string
  private modules: ModuleMap
  private modulesScanned: boolean
  private services: ServiceMap
  private taskGraph: TaskGraph

  vcs: VcsHandler

  constructor(public projectRoot: string, public projectConfig: ProjectConfig, logger?: RootLogNode) {
    this.modulesScanned = false
    this.log = logger || getLogger()
    // TODO: Support other VCS options.
    this.vcs = new GitHandler(this)
    this.taskGraph = new TaskGraph(this)

    this.modules = {}
    this.services = {}
    this.plugins = {}
    this.actionHandlers = {
      parseModule: {},
      getModuleBuildStatus: {},
      buildModule: {},
      testModule: {},
      getEnvironmentStatus: {},
      configureEnvironment: {},
      getServiceStatus: {},
      deployService: {},
      getServiceOutputs: {},
      execInService: {},
      getServiceLogs: {},
    }

    this.projectConfig = projectConfig
    this.projectName = this.projectConfig.name

    this.setEnvironment(this.projectConfig.defaultEnvironment)
  }

  static async factory(projectRoot: string, { logger, plugins = [] }: ContextOpts = {}) {
    const projectConfig = await resolveTemplateStrings(loadProjectConfig(projectRoot), await getTemplateContext())

    plugins = builtinPlugins.concat(plugins)

    const ctx = new GardenContext(projectRoot, projectConfig, logger)

    // Load configured plugins
    for (const plugin of plugins) {
      ctx.registerPlugin(plugin)
    }

    // validate the provider configuration
    for (const envName in projectConfig.environments) {
      const envConfig = projectConfig.environments[envName]

      for (const providerName in envConfig.providers) {
        const providerConfig = envConfig.providers[providerName]
        const providerType = providerConfig.type

        if (!ctx.plugins[providerType]) {
          throw new ConfigurationError(
            `Could not find plugin type ${providerType} (specified in environment ${envName})`,
            { envName, providerType },
          )
        }
      }
    }

    return ctx
  }

  setEnvironment(environment: string) {
    const parts = environment.split(".")
    const name = parts[0]
    const namespace = parts.slice(1).join(".") || DEFAULT_NAMESPACE

    if (!this.projectConfig.environments[name]) {
      throw new ParameterError(`Could not find environment ${environment}`, {
        name,
        namespace,
      })
    }

    if (namespace.startsWith("garden-")) {
      throw new ParameterError(`Namespace cannot start with "garden-"`, {
        name,
        namespace,
      })
    }

    this.environment = name
    this.namespace = namespace

    return { name, namespace }
  }

  getEnvironment(): Environment {
    if (!this.environment) {
      throw new PluginError(`Environment has not been set`, {})
    }

    return {
      name: this.environment,
      namespace: this.namespace,
      config: this.projectConfig.environments[this.environment],
    }
  }

  async addTask(task: Task) {
    await this.taskGraph.addTask(task)
  }

  async processTasks() {
    return this.taskGraph.processTasks()
  }

  registerPlugin(pluginFactory: PluginFactory) {
    const plugin = pluginFactory(this)
    const pluginName = Joi.attempt(plugin.name, joiIdentifier())

    if (this.plugins[pluginName]) {
      throw new ConfigurationError(`Plugin ${pluginName} declared more than once`, {
        previous: this.plugins[pluginName],
        adding: plugin,
      })
    }

    this.plugins[pluginName] = plugin

    for (const action of pluginActionNames) {
      const actionHandler = plugin[action]

      if (actionHandler) {
        const wrapped = (...args) => {
          return actionHandler.apply(plugin, args)
        }
        wrapped["actionType"] = action
        wrapped["pluginName"] = pluginName
        this.actionHandlers[action][pluginName] = wrapped
      }
    }
  }

  /*
    Returns all modules that are registered in this context.
    Scans for modules in the project root if it hasn't already been done.
   */
  async getModules(names?: string[], noScan?: boolean) {
    if (!this.modulesScanned && !noScan) {
      await this.scanModules()
    }

    if (!names) {
      return this.modules
    }

    const output = {}
    const missing: string[] = []

    for (const name of names) {
      const module = this.modules[name]

      if (!module) {
        missing.push(name)
      } else {
        output[name] = module
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

  /*
    Returns all services that are registered in this context.
    Scans for modules and services in the project root if it hasn't already been done.
   */
  async getServices(names?: string[], noScan?: boolean): Promise<ServiceMap> {
    // TODO: deduplicate (this is almost the same as getModules()
    if (!this.modulesScanned && !noScan) {
      await this.scanModules()
    }

    if (!names) {
      return this.services
    }

    const output = {}
    const missing: string[] = []

    for (const name of names) {
      const module = this.services[name]

      if (!module) {
        missing.push(name)
      } else {
        output[name] = module
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

  /*
    Scans the project root for modules and adds them to the context
   */
  async scanModules() {
    const ignorer = getIgnorer(this.projectRoot)
    const scanOpts = {
      filter: (path) => {
        const relPath = relative(this.projectRoot, path)
        return !ignorer.ignores(relPath)
      },
    }

    for await (const item of scanDirectory(this.projectRoot, scanOpts)) {
      const parsedPath = parse(item.path)

      if (parsedPath.base !== MODULE_CONFIG_FILENAME) {
        continue
      }

      const module = await this.resolveModule(parsedPath.dir)
      this.addModule(module)
    }

    this.modulesScanned = true
  }

  /*
    Adds the specified module to the context

    @param force - add the module again, even if it's already registered
   */
  addModule(module: Module, force = false) {
    const config = module.config

    if (!force && this.modules[config.name]) {
      const pathA = this.modules[config.name].path
      const pathB = relative(this.projectRoot, module.path)

      throw new ConfigurationError(
        `Module ${config.name} is declared multiple times ('${pathA}' and '${pathB}')`,
        { pathA, pathB },
      )
    }

    this.modules[config.name] = module

    // Add to service-module map
    for (const serviceName in config.services || {}) {
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

      this.services[serviceName] = new Service(module, serviceName)
    }
  }

  /*
    Maps the provided name or locator to a Module. We first look for a module in the
    project with the provided name. If it does not exist, we treat it as a path
    (resolved with the project path as a base path) and attempt to load the module
    from there.

    // TODO: support git URLs
   */
  async resolveModule<T extends Module = Module>(nameOrLocation: string): Promise<T> {
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
    const config = await loadModuleConfig(path)

    const parseHandler = this.getActionHandler("parseModule", config.type)
    return parseHandler({ ctx: this, config })
  }

  async getTemplateContext(extraContext: TemplateStringContext = {}): Promise<TemplateStringContext> {
    const context: TemplateStringContext = {
      // TODO: add secret resolver here
      variables: this.projectConfig.variables,
      environmentConfig: <any>this.getEnvironment().config,
      ...extraContext,
    }

    return getTemplateContext(context)
  }

  //===========================================================================
  //region Plugin actions
  //===========================================================================

  async getModuleBuildStatus<T extends Module>(module: T): Promise<BuildStatus> {
    const defaultHandler = this.actionHandlers["getModuleBuildStatus"]["generic"]
    const handler = this.getActionHandler("getModuleBuildStatus", module.type, defaultHandler)
    return handler({ ctx: this, module })
  }

  async buildModule<T extends Module>(module: T, logEntry?: LogEntry) {
    const defaultHandler = this.actionHandlers["buildModule"]["generic"]
    const handler = this.getActionHandler("buildModule", module.type, defaultHandler)
    return handler({ ctx: this, module, logEntry })
  }

  async testModule<T extends Module>(module: T, testSpec: TestSpec, logEntry?: LogEntry) {
    const defaultHandler = this.actionHandlers["testModule"]["generic"]
    const handler = this.getEnvActionHandler("testModule", module.type, defaultHandler)
    const env = this.getEnvironment()
    return handler({ ctx: this, module, testSpec, env, logEntry })
  }

  async getEnvironmentStatus() {
    const handlers = this.getEnvActionHandlers("getEnvironmentStatus")
    const env = this.getEnvironment()
    return Bluebird.props(mapValues(handlers, h => h({ ctx: this, env })))
  }

  async configureEnvironment() {
    const handlers = this.getEnvActionHandlers("configureEnvironment")
    const env = this.getEnvironment()
    await Bluebird.each(values(handlers), h => h({ ctx: this, env }))
    return this.getEnvironmentStatus()
  }

  async getServiceStatus<T extends Module>(service: Service<T>) {
    const handler = this.getEnvActionHandler("getServiceStatus", service.module.type)
    return handler({ ctx: this, service, env: this.getEnvironment() })
  }

  async deployService<T extends Module>(service: Service<T>, serviceContext?: ServiceContext) {
    const handler = this.getEnvActionHandler("deployService", service.module.type)
    return handler({ ctx: this, service, serviceContext: serviceContext || {}, env: this.getEnvironment() })
  }

  async getServiceOutputs<T extends Module>(service: Service<T>) {
    // TODO: We might want to generally allow for "default handlers"
    let handler: PluginActions<T>["getServiceOutputs"]
    try {
      handler = this.getEnvActionHandler("getServiceOutputs", service.module.type)
    } catch (err) {
      return {}
    }
    return handler({ ctx: this, service, env: this.getEnvironment() })
  }

  async execInService<T extends Module>(service: Service<T>, command: string[]) {
    const handler = this.getEnvActionHandler("execInService", service.module.type)
    return handler({ ctx: this, service, command, env: this.getEnvironment() })
  }

  //endregion

  //===========================================================================
  //region Internal helpers
  //===========================================================================

  /**
   * Get a list of all available plugins (not specific to an environment).
   *
   * Optionally filter to only include plugins that support a specific module type.
   */
  private getAllPlugins(moduleType?: string): Plugin<any>[] {
    const allPlugins = values(this.plugins)

    if (moduleType) {
      return allPlugins.filter(p => p.supportedModuleTypes.includes(moduleType))
    } else {
      return allPlugins
    }
  }

  /**
   * Get a list of all configured plugins for the currently set environment.
   * Includes built-in module handlers (used for builds and such).
   *
   * Optionally filter to only include plugins that support a specific module type.
   */
  private getEnvPlugins(moduleType?: string) {
    const env = this.getEnvironment()
    const allPlugins = this.getAllPlugins(moduleType)
    const envProviderTypes = values(env.config.providers).map(p => p.type)

    return allPlugins.filter(p => envProviderTypes.includes(p.name))
  }

  /**
   * Get a handler for the specified action (and optionally module type).
   */
  public getActionHandlers
    <T extends keyof PluginActions<any>>(type: T, moduleType?: string): ActionHandlerMap<T> {

    const handlers: ActionHandlerMap<T> = {}

    this.getAllPlugins(moduleType)
      .filter(p => !!p[type])
      .map(p => {
        handlers[p.name] = this.actionHandlers[type][p.name]
      })

    return handlers
  }

  /**
   * Get the last configured handler for the specified action (and optionally module type).
   */
  public getActionHandler<T extends keyof PluginActions<any>>(
    type: T, moduleType?: string, defaultHandler?: PluginActions<any>[T],
  ): PluginActions<any>[T] {

    const handlers = values(this.getActionHandlers(type, moduleType))

    if (handlers.length) {
      return handlers[handlers.length - 1]
    } else if (defaultHandler) {
      return defaultHandler
    }

    // TODO: Make these error messages nicer
    let msg = `No handler for ${type} configured`

    if (moduleType) {
      msg += ` for module type ${moduleType}`
    }

    throw new ParameterError(msg, {
      requestedHandlerType: type,
      requestedModuleType: moduleType,
    })
  }

  /**
   * Get all handlers for the specified action for the currently set environment
   * (and optionally module type).
   */
  public getEnvActionHandlers
    <T extends keyof PluginActions<any>>(type: T, moduleType?: string): ActionHandlerMap<T> {

    const handlers: ActionHandlerMap<T> = {}

    this.getEnvPlugins(moduleType)
      .filter(p => !!p[type])
      .map(p => {
        handlers[p.name] = this.actionHandlers[type][p.name]
      })

    return handlers
  }

  /**
   * Get last configured handler for the specified action for the currently set environment
   * (and optionally module type).
   */
  public getEnvActionHandler<T extends keyof PluginActions<any>>(
    type: T, moduleType?: string, defaultHandler?: PluginActions<any>[T],
  ): PluginActions<any>[T] {

    const handlers = values(this.getEnvActionHandlers(type, moduleType))

    if (handlers.length) {
      return handlers[handlers.length - 1]
    } else if (defaultHandler) {
      return defaultHandler
    }

    const env = this.getEnvironment()
    let msg = `No handler for ${type} configured for environment ${env.name}`

    if (moduleType) {
      msg += ` and module type ${moduleType}`
    }

    throw new ParameterError(msg, {
      requestedHandlerType: type,
      requestedModuleType: moduleType,
      environment: env.name,
    })
  }

  //endregion
}
