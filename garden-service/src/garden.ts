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
  join,
} from "path"
import {
  extend,
  flatten,
  isString,
  merge,
  keyBy,
  cloneDeep,
  sortBy,
  findIndex,
} from "lodash"
const AsyncLock = require("async-lock")

import { TreeCache } from "./cache"
import { builtinPlugins, fixedPlugins } from "./plugins/plugins"
import { Module, getModuleCacheContext, getModuleKey, ModuleConfigMap } from "./types/module"
import { moduleActionNames, pluginModuleSchema, pluginSchema } from "./types/plugin/plugin"
import { Environment, SourceConfig, ProviderConfig, Provider } from "./config/project"
import {
  findByName,
  getIgnorer,
  getNames,
  scanDirectory,
  pickKeys,
  Ignorer,
} from "./util/util"
import { DEFAULT_NAMESPACE, MODULE_CONFIG_FILENAME } from "./constants"
import {
  ConfigurationError,
  ParameterError,
  PluginError,
  RuntimeError,
} from "./exceptions"
import { VcsHandler, ModuleVersion } from "./vcs/base"
import { GitHandler } from "./vcs/git"
import { BuildDir } from "./build-dir"
import { ConfigGraph } from "./config-graph"
import { TaskGraph, TaskResults } from "./task-graph"
import { getLogger } from "./logger/logger"
import { pluginActionNames, PluginActions, PluginFactory, GardenPlugin } from "./types/plugin/plugin"
import { joiIdentifier, validate, PrimitiveMap } from "./config/common"
import { resolveTemplateStrings } from "./template-string"
import {
  configSchema,
  GardenConfig,
  loadConfig,
  findProjectConfig,
} from "./config/base"
import { BaseTask } from "./tasks/base"
import { LocalConfigStore } from "./config-store"
import { getLinkedSources, ExternalSourceType } from "./util/ext-source-util"
import { BuildDependencyConfig, ModuleConfig } from "./config/module"
import { ProjectConfigContext, ModuleConfigContext } from "./config/config-context"
import { ActionHelper } from "./actions"
import { createPluginContext } from "./plugin-context"
import { ModuleAndRuntimeActions, Plugins, RegisterPluginParam } from "./types/plugin/plugin"
import { SUPPORTED_PLATFORMS, SupportedPlatform } from "./constants"
import { platform, arch } from "os"
import { LogEntry } from "./logger/log-entry"
import { EventBus } from "./events"
import { Watcher } from "./watch"

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
  private readonly loadedPlugins: { [key: string]: GardenPlugin }
  private moduleConfigs: ModuleConfigMap
  private pluginModuleConfigs: ModuleConfig[]
  private modulesScanned: boolean
  private readonly registeredPlugins: { [key: string]: PluginFactory }
  private readonly taskGraph: TaskGraph
  private readonly watcher: Watcher

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
    public readonly ignorer: Ignorer,
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
    this.loadedPlugins = {}
    this.pluginModuleConfigs = []
    this.registeredPlugins = {}

    this.taskGraph = new TaskGraph(this, this.log)
    this.actions = new ActionHelper(this)
    this.events = new EventBus()
    this.watcher = new Watcher(this, this.log)
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
    const ignorer = await getIgnorer(projectRoot)

    const garden = new this(
      projectRoot,
      projectName,
      environmentName,
      variables,
      projectSources,
      buildDir,
      ignorer,
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

  /**
   * Clean up before shutting down.
   */
  async close() {
    this.watcher.stop()
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

  /**
   * Enables the file watcher for the project.
   * Make sure to stop it using `.close()` when cleaning up or when watching is no longer needed.
   */
  async startWatcher(graph: ConfigGraph) {
    const modules = await graph.getModules()
    this.watcher.start(modules)
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

  private async loadPlugin(pluginName: string, config: ProviderConfig) {
    const factory = this.registeredPlugins[pluginName]

    if (!factory) {
      throw new ConfigurationError(`Configured plugin '${pluginName}' has not been registered`, {
        name: pluginName,
        availablePlugins: Object.keys(this.registeredPlugins),
      })
    }

    let plugin: GardenPlugin

    try {
      plugin = await factory({
        projectName: this.projectName,
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

    for (const modulePath of plugin.modules || []) {
      let moduleConfigs = await this.loadModuleConfigs(modulePath)
      if (!moduleConfigs) {
        throw new PluginError(`Could not load module(s) at "${modulePath}" specified in plugin "${pluginName}"`, {
          pluginName,
          modulePath,
        })
      }

      for (const moduleConfig of moduleConfigs) {
        moduleConfig.plugin = pluginName
        this.pluginModuleConfigs.push(moduleConfig)
      }
    }

    const actions = plugin.actions || {}

    for (const actionType of pluginActionNames) {
      const handler = actions[actionType]
      handler && this.actions.addActionHandler(pluginName, actionType, handler)
    }

    const moduleActions = plugin.moduleActions || {}

    for (const moduleType of Object.keys(moduleActions)) {
      for (const actionType of moduleActionNames) {
        const handler = moduleActions[moduleType][actionType]
        handler && this.actions.addModuleActionHandler(pluginName, actionType, moduleType, handler)
      }
    }

    // allow plugins to be configured more than once
    // (to support extending config for fixed plugins and environment defaults)
    let providerIndex = findIndex(this.environment.providers, ["name", pluginName])
    let providerConfig: ProviderConfig = providerIndex === -1
      ? config
      : this.environment.providers[providerIndex].config

    extend(providerConfig, config)

    // call configureProvider action if provided
    const configureHandler = actions.configureProvider

    if (plugin.configSchema) {
      providerConfig = validate(providerConfig, plugin.configSchema, { context: `${pluginName} configuration` })
    }

    if (configureHandler) {
      const configureOutput = await configureHandler({ config: providerConfig })
      providerConfig = configureOutput.config
    }

    if (providerIndex === -1) {
      this.environment.providers.push({ name: pluginName, config: providerConfig })
    } else {
      this.environment.providers[providerIndex].config = providerConfig
    }
  }

  getPlugin(pluginName: string) {
    const plugin = this.loadedPlugins[pluginName]

    if (!plugin) {
      throw new PluginError(`Could not find plugin ${pluginName}. Are you missing a provider configuration?`, {
        pluginName,
        availablePlugins: Object.keys(this.loadedPlugins),
      })
    }

    return plugin
  }

  /**
   * Returns module configs that are registered in this context, before template resolution and validation.
   * Scans for modules in the project root and remote/linked sources if it hasn't already been done.
   */
  async getRawModuleConfigs(keys?: string[]): Promise<ModuleConfig[]> {
    if (!this.modulesScanned) {
      await this.scanModules()
    }

    return Object.values(
      keys ? pickKeys(this.moduleConfigs, keys, "module") : this.moduleConfigs,
    )
  }

  /**
   * Returns module configs that are registered in this context, fully resolved and configured (via their respective
   * plugin handlers).
   * Scans for modules in the project root and remote/linked sources if it hasn't already been done.
   */
  async resolveModuleConfigs(keys?: string[], configContext?: ModuleConfigContext): Promise<ModuleConfig[]> {
    const configs = await this.getRawModuleConfigs(keys)

    if (!configContext) {
      configContext = new ModuleConfigContext(this, this.environment, Object.values(this.moduleConfigs))
    }

    return Bluebird.map(configs, async (config) => {
      config = await resolveTemplateStrings(cloneDeep(config), configContext!)

      const configureHandler = await this.actions.getModuleActionHandler({
        actionType: "configure",
        moduleType: config.type,
      })
      const ctx = this.getPluginContext(configureHandler["pluginName"])

      config = await configureHandler({ ctx, moduleConfig: config })

      // FIXME: We should be able to avoid this
      config.name = getModuleKey(config.name, config.plugin)

      return config
    })
  }

  /**
   * Returns the module with the specified name. Throws error if it doesn't exist.
   */
  async resolveModuleConfig(name: string, configContext?: ModuleConfigContext): Promise<ModuleConfig> {
    return (await this.resolveModuleConfigs([name], configContext))[0]
  }

  /**
   * Resolve the raw module configs and return a new instance of ConfigGraph.
   * The graph instance is immutable and represents the configuration at the point of calling this method.
   * For long-running processes, you need to call this again when any module or configuration has been updated.
   */
  async getConfigGraph() {
    const modules = await this.resolveModuleConfigs()
    return new ConfigGraph(this, modules)
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

      const rawConfigs: ModuleConfig[] = [...this.pluginModuleConfigs]

      await Bluebird.map(modulePaths, async path => {
        const configs = await this.loadModuleConfigs(path)
        if (configs) {
          rawConfigs.push(...configs)
        }
      })

      for (const config of rawConfigs) {
        this.addModule(config)
      }

      this.modulesScanned = true
    })
  }

  /**
   * Returns true if a module has been configured in this project with the specified name.
   */
  hasModule(name: string) {
    return !!this.moduleConfigs[name]
  }

  /**
   * Add a module config to the context, after validating and calling the appropriate configure plugin handler.
   * Template strings should be resolved on the config before calling this.
   */
  private addModule(config: ModuleConfig) {
    const key = getModuleKey(config.name, config.plugin)

    if (this.moduleConfigs[key]) {
      const [pathA, pathB] = [
        relative(this.projectRoot, join(this.moduleConfigs[key].path, MODULE_CONFIG_FILENAME)),
        relative(this.projectRoot, join(config.path, MODULE_CONFIG_FILENAME)),
      ].sort()

      throw new ConfigurationError(
        `Module ${key} is declared multiple times (in '${pathA}' and '${pathB}')`,
        { pathA, pathB },
      )
    }

    this.moduleConfigs[key] = config
  }

  /**
   * Load a module from the specified directory and return the config, or null if no module is found.
   *
   * @param path Directory containing the module
   */
  private async loadModuleConfigs(path: string): Promise<ModuleConfig[] | null> {
    const config = await loadConfig(this.projectRoot, resolve(this.projectRoot, path))

    if (!config || !config.modules) {
      return null
    }

    return Bluebird.map(cloneDeep(config.modules), async (moduleConfig) => {
      if (moduleConfig.repositoryUrl) {
        moduleConfig.path = await this.loadExtSourcePath({
          name: moduleConfig.name,
          repositoryUrl: moduleConfig.repositoryUrl,
          sourceType: "module",
        })
      }
      return moduleConfig
    })
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
   * This dumps the full project configuration including all modules.
   */
  public async dumpConfig(): Promise<ConfigDump> {
    return {
      environmentName: this.environment.name,
      providers: this.environment.providers,
      variables: this.environment.variables,
      moduleConfigs: sortBy(await this.resolveModuleConfigs(), "name"),
    }
  }

  //endregion
}

export interface ConfigDump {
  environmentName: string
  providers: Provider[]
  variables: PrimitiveMap
  moduleConfigs: ModuleConfig[]
}
