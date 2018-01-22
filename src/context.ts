import { parse, relative } from "path"
import { pick, values } from "lodash"
import * as Joi from "joi"
import { loadModuleConfig, Module } from "./types/module"
import { loadProjectConfig, ProjectConfig } from "./types/project-config"
import { getIgnorer, scanDirectory } from "./util"
import { DEFAULT_NAMESPACE, MODULE_CONFIG_FILENAME } from "./constants"
import { ConfigurationError, ParameterError, PluginError } from "./exceptions"
import { VcsHandler } from "./vcs/base"
import { GitHandler } from "./vcs/git"
import { NpmPackageModuleHandler } from "./moduleHandlers/npm-package"
import { Task, TaskGraph } from "./task-graph"
import { getLogger, Logger } from "./log"
import {
  pluginActionNames, PluginActions, PluginFactory, PluginInterface,
} from "./types/plugin"
import { Environment, JoiIdentifier } from "./types/common"
import { GenericModuleHandler } from "./moduleHandlers/generic"
import { GenericFunctionModuleHandler } from "./moduleHandlers/function"
import { ContainerModuleHandler } from "./moduleHandlers/container"
import { LocalDockerSwarmProvider } from "./providers/local/local-docker-swarm"
import { Service } from "./types/service"

interface ModuleMap { [key: string]: Module }
interface ServiceMap { [key: string]: Service<any> }

type PluginActionMap = {
  [A in keyof PluginActions<any>]: {
    [pluginName: string]: PluginActions<any>[A],
  }
}

const builtinPlugins = [
  GenericModuleHandler,
  ContainerModuleHandler,
  GenericFunctionModuleHandler,
  NpmPackageModuleHandler,
  LocalDockerSwarmProvider,
]

export class GardenContext {
  public log: Logger
  public actionHandlers: PluginActionMap
  public projectName: string
  public config: ProjectConfig

  // TODO: We may want to use the _ prefix for private properties even if it's not idiomatic TS,
  // because we're supporting plain-JS plugins as well.
  private environment: string
  private namespace: string
  private plugins: { [key: string]: PluginInterface<any> }
  private modules: ModuleMap
  private services: ServiceMap
  private taskGraph: TaskGraph

  vcs: VcsHandler

  constructor(public projectRoot: string, logger?: Logger) {
    this.log = logger || getLogger()
    // TODO: Support other VCS options.
    this.vcs = new GitHandler(this)
    this.taskGraph = new TaskGraph(this)

    this.plugins = {}
    this.actionHandlers = {
      parseModule: {},
      getModuleBuildStatus: {},
      buildModule: {},
      getEnvironmentStatus: {},
      configureEnvironment: {},
      getServiceStatus: {},
      deployService: {},
    }

    // Load built-in plugins
    for (const pluginCls of builtinPlugins) {
      this.registerPlugin((ctx) => new pluginCls(ctx))
    }

    this.config = loadProjectConfig(this.projectRoot)
    this.projectName = this.config.name
  }

  setEnvironment(environment: string) {
    const parts = environment.split(".")
    const name = parts[0]
    const namespace = parts.slice(1).join(".") || DEFAULT_NAMESPACE

    if (!this.config.environments[name]) {
      throw new ParameterError(`Could not find environment ${environment}`, {
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
      config: this.config.environments[this.environment],
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
    const pluginName = Joi.attempt(plugin.name, JoiIdentifier())

    if (this.plugins[pluginName]) {
      throw new PluginError(`Plugin ${pluginName} declared more than once`, {
        previous: this.plugins[pluginName],
        adding: plugin,
      })
    }

    this.plugins[pluginName] = plugin

    for (const action of pluginActionNames) {
      const actionHandler = plugin[action]

      if (actionHandler) {
        this.actionHandlers[action][pluginName] = (...args) => {
          return actionHandler.apply(plugin, args)
        }
      }
    }
  }

  async getModules(names?: string[]) {
    // TODO: Break this method up and test
    if (!this.modules) {
      const modules: ModuleMap = {}
      const services: ServiceMap = {}
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
        const config = module.config

        if (modules[config.name]) {
          const pathA = modules[config.name].path
          const pathB = relative(this.projectRoot, item.path)

          throw new ConfigurationError(
            `Module ${config.name} is declared multiple times ('${pathA}' and '${pathB}')`,
            { pathA, pathB },
          )
        }

        modules[config.name] = module

        // Add to service-module map
        for (const serviceName in config.services || {}) {
          if (services[serviceName]) {
            throw new ConfigurationError(
              `Service names must be unique - ${serviceName} is declared multiple times ` +
              `(in '${services[serviceName].module.name}' and '${config.name}')`,
              {
                serviceName,
                moduleA: services[serviceName].module.name,
                moduleB: config.name,
              },
            )
          }

          services[serviceName] = {
            name: serviceName,
            module,
            config: config.services[serviceName],
          }
        }
      }

      this.modules = modules
      this.services = services
    }

    // TODO: Throw error on missing module
    return names === undefined ? this.modules : pick(this.modules, names)
  }

  /*
    Maps the provided name or locator to a Module. We first look for a module in the
    project with the provided name. If it does not exist, we check if it is a path
    and exists there, and then attempt to load the module.

    // TODO: support git URLs
   */
  async resolveModule(nameOrLocation: string): Promise<Module> {
    const parsedPath = parse(nameOrLocation)

    if (parsedPath.dir === "" && this.modules && this.modules[nameOrLocation]) {
      return this.modules[nameOrLocation]
    }

    const config = await loadModuleConfig(nameOrLocation)

    const parseHandler = this.getActionHandler("parseModule", config.type)
    return parseHandler(this, config)
  }

  async getServices(names?: string[]): Promise<ServiceMap> {
    await this.getModules()
    // TODO: Throw error on missing service
    return names === undefined ? this.services : pick(this.services, names)
  }

  //===========================================================================
  //region Plugin actions
  //===========================================================================

  async getEnvironmentStatus() {
    const handler = this.getEnvActionHandler("getEnvironmentStatus")
    return handler(this.getEnvironment())
  }

  async configureEnvironment() {
    const handler = this.getEnvActionHandler("configureEnvironment")
    return handler(this.getEnvironment())
  }

  async getServiceStatus<T extends Module>(service: Service<T>) {
    const handler = this.getEnvActionHandler("getServiceStatus", service.module.type)
    return handler(service, this.getEnvironment())
  }

  async deployService<T extends Module>(service: Service<T>) {
    const handler = this.getEnvActionHandler("deployService", service.module.type)
    return handler(service, this.getEnvironment())
  }

  //===========================================================================
  //region Internal helpers
  //===========================================================================

  /**
   * Get a list of all available plugins (not specific to an environment).
   *
   * Optionally filter to only include plugins that support a specific module type.
   */
  private getAllPlugins(moduleType?: string): PluginInterface<any>[] {
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
  public getActionHandler
    <T extends keyof PluginActions<any>>(type: T, moduleType?: string): PluginActions<any>[T] {

    const plugins = this.getAllPlugins(moduleType)

    for (const plugin of plugins) {
      if (!plugin[type]) {
        continue
      }

      return this.actionHandlers[type][plugin.name]
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
   * Get a handler for the specified action for the currently set environment
   * (and optionally module type).
   */
  public getEnvActionHandler
    <T extends keyof PluginActions<any>>(type: T, moduleType?: string): PluginActions<any>[T] {

    const plugins = this.getEnvPlugins(moduleType)

    for (const plugin of plugins) {
      if (!plugin[type]) {
        continue
      }

      return this.actionHandlers[type][plugin.name]
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
