/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import { parse, relative, resolve, sep, join } from "path"
import { flatten, isString, cloneDeep, sortBy, set, zip } from "lodash"
const AsyncLock = require("async-lock")

import { TreeCache } from "./cache"
import { builtinPlugins } from "./plugins/plugins"
import { Module, getModuleCacheContext, getModuleKey, ModuleConfigMap } from "./types/module"
import { pluginModuleSchema, pluginSchema } from "./types/plugin/plugin"
import { SourceConfig, ProjectConfig, resolveProjectConfig, pickEnvironment } from "./config/project"
import { findByName, pickKeys, getPackageVersion } from "./util/util"
import { ConfigurationError, PluginError, RuntimeError } from "./exceptions"
import { VcsHandler, ModuleVersion } from "./vcs/vcs"
import { GitHandler } from "./vcs/git"
import { BuildDir } from "./build-dir"
import { ConfigGraph } from "./config-graph"
import { TaskGraph, TaskResults } from "./task-graph"
import { getLogger } from "./logger/logger"
import { PluginActions, PluginFactory, GardenPlugin } from "./types/plugin/plugin"
import { joiIdentifier, validate, PrimitiveMap, validateWithPath } from "./config/common"
import { resolveTemplateStrings } from "./template-string"
import { loadConfig, findProjectConfig } from "./config/base"
import { BaseTask } from "./tasks/base"
import { LocalConfigStore, ConfigStore } from "./config-store"
import { getLinkedSources, ExternalSourceType } from "./util/ext-source-util"
import { BuildDependencyConfig, ModuleConfig, baseModuleSpecSchema, ModuleResource } from "./config/module"
import { ModuleConfigContext, ContextResolveOpts } from "./config/config-context"
import { createPluginContext } from "./plugin-context"
import { ModuleAndRuntimeActions, Plugins, RegisterPluginParam } from "./types/plugin/plugin"
import { SUPPORTED_PLATFORMS, SupportedPlatform, CONFIG_FILENAME } from "./constants"
import { platform, arch } from "os"
import { LogEntry } from "./logger/log-entry"
import { EventBus } from "./events"
import { Watcher } from "./watch"
import { getIgnorer, Ignorer, getModulesPathsFromPath } from "./util/fs"
import { Provider, ProviderConfig, getProviderDependencies } from "./config/provider"
import { ResolveProviderTask } from "./tasks/resolve-provider"
import { ActionHelper } from "./actions"
import { DependencyGraph, detectCycles, cyclesToString } from "./util/validate-dependencies"

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
  config?: ProjectConfig,
  environmentName?: string,
  log?: LogEntry,
  plugins?: Plugins,
}

interface ModuleConfigResolveOpts extends ContextResolveOpts {
  configContext?: ModuleConfigContext
}

const asyncLock = new AsyncLock()

export class Garden {
  public readonly log: LogEntry
  private readonly loadedPlugins: { [key: string]: GardenPlugin }
  private moduleConfigs: ModuleConfigMap
  private pluginModuleConfigs: ModuleConfig[]
  private resolvedProviders: Provider[]
  private modulesScanned: boolean
  private readonly registeredPlugins: { [key: string]: PluginFactory }
  private readonly taskGraph: TaskGraph
  private readonly watcher: Watcher

  public readonly configStore: ConfigStore
  public readonly vcs: VcsHandler
  public readonly cache: TreeCache
  private actionHelper: ActionHelper
  public readonly events: EventBus

  constructor(
    public readonly projectRoot: string,
    public readonly projectName: string,
    public readonly environmentName: string,
    public readonly variables: PrimitiveMap,
    public readonly projectSources: SourceConfig[] = [],
    public readonly buildDir: BuildDir,
    public readonly ignorer: Ignorer,
    public readonly opts: GardenOpts,
    plugins: Plugins,
    private readonly providerConfigs: ProviderConfig[],
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
    this.configStore = new LocalConfigStore(this.projectRoot)
    this.cache = new TreeCache()

    this.moduleConfigs = {}
    this.loadedPlugins = {}
    this.pluginModuleConfigs = []
    this.registeredPlugins = {}

    this.taskGraph = new TaskGraph(this, this.log)
    this.events = new EventBus(this.log)
    this.watcher = new Watcher(this, this.log)

    // Register plugins
    for (const [name, pluginFactory] of Object.entries({ ...builtinPlugins, ...plugins })) {
      // This cast is required for the linter to accept the instance type hackery.
      this.registerPlugin(name, pluginFactory)
    }
  }

  static async factory<T extends typeof Garden>(
    this: T, currentDirectory: string, opts: GardenOpts = {},
  ): Promise<InstanceType<T>> {
    let { environmentName, config, plugins = {} } = opts

    if (!config) {
      config = await findProjectConfig(currentDirectory)

      if (!config) {
        throw new ConfigurationError(
          `Not a project directory (or any of the parent directories): ${currentDirectory}`,
          { currentDirectory },
        )
      }
    }

    config = await resolveProjectConfig(config)

    const {
      defaultEnvironment,
      name: projectName,
      sources: projectSources,
      path: projectRoot,
    } = config

    if (!environmentName) {
      environmentName = defaultEnvironment
    }

    const { providers, variables } = pickEnvironment(config, environmentName)

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
      plugins,
      providers,
    ) as InstanceType<T>

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

  async processTasks(tasks: BaseTask[]): Promise<TaskResults> {
    return this.taskGraph.process(tasks)
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

      let pluginModule: any

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

  private async loadPlugin(pluginName: string) {
    if (this.loadedPlugins[pluginName]) {
      return this.loadedPlugins[pluginName]
    }

    this.log.silly(`Loading plugin ${pluginName}`)
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

    this.log.silly(`Done loading plugin ${pluginName}`)

    return plugin
  }

  getPlugin(pluginName: string) {
    const plugin = this.loadedPlugins[pluginName]

    if (!plugin) {
      throw new PluginError(`Could not find plugin '${pluginName}'. Are you missing a provider configuration?`, {
        pluginName,
        availablePlugins: Object.keys(this.loadedPlugins),
      })
    }

    return plugin
  }

  getRawProviderConfigs() {
    return this.providerConfigs
  }

  async resolveProviders(): Promise<Provider[]> {
    await asyncLock.acquire("resolve-providers", async () => {
      if (this.resolvedProviders) {
        return
      }

      const rawConfigs = this.getRawProviderConfigs()
      const plugins = await Bluebird.map(rawConfigs, async (config) => this.loadPlugin(config.name))

      // Detect circular deps here
      const pluginGraph: DependencyGraph = {}

      await Bluebird.map(zip(plugins, rawConfigs), async ([plugin, config]) => {
        for (const dep of await getProviderDependencies(plugin!, config!)) {
          set(pluginGraph, [config!.name, dep], { distance: 1, next: dep })
        }
      })

      const cycles = detectCycles(pluginGraph)

      if (cycles.length > 0) {
        const cyclesStr = cyclesToString(cycles)

        throw new PluginError(
          "One or more circular dependencies found between providers or their configurations: " + cyclesStr,
          { cycles },
        )
      }

      const tasks = rawConfigs.map((config, i) => {
        // TODO: actually resolve version, based on the VCS version of the plugin and its dependencies
        const version = {
          versionString: getPackageVersion(),
          dirtyTimestamp: null,
          commitHash: getPackageVersion(),
          dependencyVersions: {},
          files: [],
        }

        const plugin = plugins[i]

        return new ResolveProviderTask({
          garden: this,
          log: this.log,
          plugin,
          config,
          version,
        })
      })
      const taskResults = await this.processTasks(tasks)

      const failed = Object.values(taskResults).filter(r => !!r.error)

      if (failed.length) {
        const messages = failed.map(r => `- ${r.name}: ${r.error!.message}`)
        throw new PluginError(
          `Failed resolving one or more provider configurations:\n${messages.join("\n")}`,
          { rawConfigs, taskResults, messages },
        )
      }

      this.resolvedProviders = Object.values(taskResults).map(result => result.output)

      for (const provider of this.resolvedProviders) {
        for (const moduleConfig of provider.moduleConfigs) {
          // Make sure module and all nested entities are scoped to the plugin
          moduleConfig.plugin = provider.name
          this.addModule(moduleConfig)
        }
      }
    })

    return this.resolvedProviders
  }

  async getActionHelper() {
    if (!this.actionHelper) {
      const providers = await this.resolveProviders()
      this.actionHelper = new ActionHelper(this, providers)
    }

    return this.actionHelper
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
  async resolveModuleConfigs(keys?: string[], opts: ModuleConfigResolveOpts = {}): Promise<ModuleConfig[]> {
    const actions = await this.getActionHelper()
    const configs = await this.getRawModuleConfigs(keys)

    if (!opts.configContext) {
      opts.configContext = new ModuleConfigContext(
        this,
        this.environmentName,
        await this.resolveProviders(),
        this.variables,
        Object.values(this.moduleConfigs),
      )
    }

    return Bluebird.map(configs, async (config) => {
      config = await resolveTemplateStrings(cloneDeep(config), opts.configContext!, opts)
      const description = await actions.describeType(config.type)

      config.spec = validateWithPath({
        config: config.spec,
        schema: description.schema,
        name: config.name,
        path: config.path,
        projectRoot: this.projectRoot,
      })

      /*
        We allow specifying modules by name only as a shorthand:

        dependencies:
          - foo-module
          - name: foo-module // same as the above
      */
      if (config.build && config.build.dependencies) {
        config.build.dependencies = config.build.dependencies
          .map(dep => typeof dep === "string" ? { name: dep, copy: [] } : dep)
      }

      config = validateWithPath({
        config,
        schema: baseModuleSpecSchema,
        configType: "module",
        name: config.name,
        path: config.path,
        projectRoot: this.projectRoot,
      })

      if (config.repositoryUrl) {
        config.path = await this.loadExtSourcePath({
          name: config.name,
          repositoryUrl: config.repositoryUrl,
          sourceType: "module",
        })
      }

      const configureHandler = await actions.getModuleActionHandler({
        actionType: "configure",
        moduleType: config.type,
      })

      const ctx = await this.getPluginContext(configureHandler["pluginName"])
      config = await configureHandler({ ctx, moduleConfig: config, log: this.log })

      if (config.plugin) {
        // Make sure nested entities in plugin modules are scoped by name
        for (const serviceConfig of config.serviceConfigs) {
          serviceConfig.name = `${config.plugin}--${serviceConfig.name}`
        }

        for (const taskConfig of config.taskConfigs) {
          taskConfig.name = `${config.plugin}--${taskConfig.name}`
        }

        for (const testConfig of config.testConfigs) {
          testConfig.name = `${config.plugin}--${testConfig.name}`
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
    })
  }

  /**
   * Returns the module with the specified name. Throws error if it doesn't exist.
   */
  async resolveModuleConfig(name: string, opts: ModuleConfigResolveOpts = {}): Promise<ModuleConfig> {
    return (await this.resolveModuleConfigs([name], opts))[0]
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
    return asyncLock.acquire("scan-modules", async () => {
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
        return await getModulesPathsFromPath(dir)
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
        relative(this.projectRoot, join(this.moduleConfigs[key].path, CONFIG_FILENAME)),
        relative(this.projectRoot, join(config.path, CONFIG_FILENAME)),
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
  private async loadModuleConfigs(path: string): Promise<ModuleConfig[]> {
    const resources = await loadConfig(this.projectRoot, resolve(this.projectRoot, path))
    return <ModuleResource[]>resources.filter(r => r.kind === "Module")
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
      environmentName: this.environmentName,
      providers: await this.resolveProviders(),
      variables: this.variables,
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
