/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { ensureDir } from "fs-extra"
import dedent from "dedent"
import { platform, arch } from "os"
import { parse, relative, resolve, dirname } from "path"
import { flatten, isString, sortBy, fromPairs, keyBy } from "lodash"
const AsyncLock = require("async-lock")

import { TreeCache } from "./cache"
import { builtinPlugins } from "./plugins/plugins"
import { Module, getModuleCacheContext, getModuleKey, ModuleConfigMap } from "./types/module"
import { pluginModuleSchema, ModuleTypeMap } from "./types/plugin/plugin"
import { SourceConfig, ProjectConfig, resolveProjectConfig, pickEnvironment, OutputSpec } from "./config/project"
import { findByName, pickKeys, getPackageVersion, getNames, findByNames } from "./util/util"
import { ConfigurationError, PluginError, RuntimeError } from "./exceptions"
import { VcsHandler, ModuleVersion } from "./vcs/vcs"
import { GitHandler } from "./vcs/git"
import { BuildDir } from "./build-dir"
import { ConfigGraph } from "./config-graph"
import { TaskGraph, TaskResults, ProcessTasksOpts } from "./task-graph"
import { getLogger } from "./logger/logger"
import { PluginActionHandlers, GardenPlugin } from "./types/plugin/plugin"
import { loadConfig, findProjectConfig, prepareModuleResource } from "./config/base"
import { PrimitiveMap } from "./config/common"
import { validateSchema } from "./config/validation"
import { BaseTask } from "./tasks/base"
import { LocalConfigStore, ConfigStore, GlobalConfigStore } from "./config-store"
import { getLinkedSources, ExternalSourceType } from "./util/ext-source-util"
import { BuildDependencyConfig, ModuleConfig, ModuleResource } from "./config/module"
import { resolveModuleConfig, ModuleConfigResolveOpts } from "./resolve-module"
import { ModuleConfigContext, OutputConfigContext } from "./config/config-context"
import { createPluginContext, CommandInfo } from "./plugin-context"
import { ModuleAndRuntimeActionHandlers, RegisterPluginParam } from "./types/plugin/plugin"
import { SUPPORTED_PLATFORMS, SupportedPlatform, DEFAULT_GARDEN_DIR_NAME } from "./constants"
import { LogEntry } from "./logger/log-entry"
import { EventBus } from "./events"
import { Watcher } from "./watch"
import {
  findConfigPathsInPath,
  getConfigFilePath,
  getWorkingCopyId,
  fixedExcludes,
  detectModuleOverlap,
  ModuleOverlap,
} from "./util/fs"
import { Provider, ProviderConfig, getAllProviderDependencyNames, defaultProvider } from "./config/provider"
import { ResolveProviderTask } from "./tasks/resolve-provider"
import { ActionRouter } from "./actions"
import { RuntimeContext } from "./runtime-context"
import { loadPlugins, getDependencyOrder, getModuleTypes } from "./plugins"
import { deline, naturalList } from "./util/string"
import { ensureConnected } from "./db/connection"
import { DependencyValidationGraph } from "./util/validate-dependencies"

export interface ActionHandlerMap<T extends keyof PluginActionHandlers> {
  [actionName: string]: PluginActionHandlers[T]
}

export interface ModuleActionHandlerMap<T extends keyof ModuleAndRuntimeActionHandlers> {
  [actionName: string]: ModuleAndRuntimeActionHandlers[T]
}

export type PluginActionMap = {
  [A in keyof PluginActionHandlers]: {
    [pluginName: string]: PluginActionHandlers[A]
  }
}

export type ModuleActionMap = {
  [A in keyof ModuleAndRuntimeActionHandlers]: {
    [moduleType: string]: {
      [pluginName: string]: ModuleAndRuntimeActionHandlers[A]
    }
  }
}

export interface GardenOpts {
  config?: ProjectConfig
  commandInfo?: CommandInfo
  gardenDirPath?: string
  environmentName?: string
  persistent?: boolean
  log?: LogEntry
  plugins?: RegisterPluginParam[]
}

export interface GardenParams {
  artifactsPath: string
  buildDir: BuildDir
  environmentName: string
  dotIgnoreFiles: string[]
  gardenDirPath: string
  log: LogEntry
  moduleIncludePatterns?: string[]
  moduleExcludePatterns?: string[]
  opts: GardenOpts
  outputs: OutputSpec[]
  plugins: RegisterPluginParam[]
  production: boolean
  projectName: string
  projectRoot: string
  projectSources?: SourceConfig[]
  providerConfigs: ProviderConfig[]
  variables: PrimitiveMap
  vcs: VcsHandler
  workingCopyId: string
}

export class Garden {
  public readonly log: LogEntry
  private loadedPlugins: GardenPlugin[]
  protected moduleConfigs: ModuleConfigMap
  private pluginModuleConfigs: ModuleConfig[]
  private resolvedProviders: { [key: string]: Provider }
  protected modulesScanned: boolean
  private readonly registeredPlugins: { [key: string]: GardenPlugin }
  private readonly taskGraph: TaskGraph
  private watcher: Watcher
  private asyncLock: any

  public readonly configStore: ConfigStore
  public readonly globalConfigStore: GlobalConfigStore
  public readonly vcs: VcsHandler
  public readonly cache: TreeCache
  private actionHelper: ActionRouter
  public readonly events: EventBus

  public readonly production: boolean
  public readonly projectRoot: string
  public readonly projectName: string
  public readonly environmentName: string
  public readonly variables: PrimitiveMap
  public readonly projectSources: SourceConfig[]
  public readonly buildDir: BuildDir
  public readonly gardenDirPath: string
  public readonly artifactsPath: string
  public readonly opts: GardenOpts
  private readonly providerConfigs: ProviderConfig[]
  public readonly workingCopyId: string
  public readonly dotIgnoreFiles: string[]
  public readonly moduleIncludePatterns?: string[]
  public readonly moduleExcludePatterns: string[]
  public readonly persistent: boolean
  public readonly rawOutputs: OutputSpec[]
  public readonly systemNamespace: string
  public readonly version: ModuleVersion

  constructor(params: GardenParams) {
    this.buildDir = params.buildDir
    this.environmentName = params.environmentName
    this.gardenDirPath = params.gardenDirPath
    this.log = params.log
    this.artifactsPath = params.artifactsPath
    this.opts = params.opts
    this.rawOutputs = params.outputs
    this.production = params.production
    this.projectName = params.projectName
    this.projectRoot = params.projectRoot
    this.projectSources = params.projectSources || []
    this.providerConfigs = params.providerConfigs
    this.variables = params.variables
    this.workingCopyId = params.workingCopyId
    this.dotIgnoreFiles = params.dotIgnoreFiles
    this.moduleIncludePatterns = params.moduleIncludePatterns
    this.moduleExcludePatterns = params.moduleExcludePatterns || []
    this.asyncLock = new AsyncLock()
    this.persistent = !!params.opts.persistent
    this.vcs = params.vcs

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
    // TODO: Support other VCS options.
    this.configStore = new LocalConfigStore(this.gardenDirPath)
    this.globalConfigStore = new GlobalConfigStore()
    this.cache = new TreeCache()

    this.moduleConfigs = {}
    this.pluginModuleConfigs = []
    this.registeredPlugins = {}
    this.resolvedProviders = {}

    this.taskGraph = new TaskGraph(this, this.log)
    this.events = new EventBus(this.log)

    // Register plugins
    for (const plugin of [...builtinPlugins, ...params.plugins]) {
      this.registerPlugin(plugin)
    }

    // TODO: actually resolve version, based on the VCS version of the plugin and its dependencies
    this.version = {
      versionString: getPackageVersion(),
      dependencyVersions: {},
      files: [],
    }
  }

  static async factory<T extends typeof Garden>(
    this: T,
    currentDirectory: string,
    opts: GardenOpts = {}
  ): Promise<InstanceType<T>> {
    let { environmentName, config, gardenDirPath, plugins = [] } = opts
    if (!config) {
      config = await findProjectConfig(currentDirectory)

      if (!config) {
        throw new ConfigurationError(
          `Not a project directory (or any of the parent directories): ${currentDirectory}`,
          { currentDirectory }
        )
      }
    }

    gardenDirPath = resolve(config.path, gardenDirPath || DEFAULT_GARDEN_DIR_NAME)
    await ensureDir(gardenDirPath)

    const artifactsPath = resolve(gardenDirPath, "artifacts")
    await ensureDir(artifactsPath)

    config = await resolveProjectConfig(config, artifactsPath)

    const { defaultEnvironment, name: projectName, sources: projectSources, path: projectRoot } = config

    if (!environmentName) {
      environmentName = defaultEnvironment
    }

    const { providers, variables, production } = await pickEnvironment(config, environmentName)

    const buildDir = await BuildDir.factory(projectRoot, gardenDirPath)
    const workingCopyId = await getWorkingCopyId(gardenDirPath)
    const log = opts.log || getLogger().placeholder()

    // We always exclude the garden dir
    const gardenDirExcludePattern = `${relative(projectRoot, gardenDirPath)}/**/*`
    const moduleExcludePatterns = [...((config.modules || {}).exclude || []), gardenDirExcludePattern, ...fixedExcludes]

    // Ensure the project root is in a git repo
    const vcs = new GitHandler(gardenDirPath, config.dotIgnoreFiles)
    await vcs.getRepoRoot(log, projectRoot)

    // Connect to the state storage
    await ensureConnected()

    const garden = new this({
      artifactsPath,
      projectRoot,
      projectName,
      environmentName,
      variables,
      projectSources,
      buildDir,
      production,
      gardenDirPath,
      opts,
      outputs: config.outputs || [],
      plugins,
      providerConfigs: providers,
      moduleExcludePatterns,
      workingCopyId,
      dotIgnoreFiles: config.dotIgnoreFiles,
      moduleIncludePatterns: (config.modules || {}).include,
      log,
      vcs,
    }) as InstanceType<T>

    return garden
  }

  /**
   * Clean up before shutting down.
   */
  async close() {
    this.watcher && (await this.watcher.stop())
  }

  getPluginContext(provider: Provider) {
    return createPluginContext(this, provider, this.opts.commandInfo)
  }

  async clearBuilds() {
    return this.buildDir.clear()
  }

  async processTasks(tasks: BaseTask[], opts?: ProcessTasksOpts): Promise<TaskResults> {
    return this.taskGraph.process(tasks, opts)
  }

  /**
   * Enables the file watcher for the project.
   * Make sure to stop it using `.close()` when cleaning up or when watching is no longer needed.
   */
  async startWatcher(graph: ConfigGraph, bufferInterval?: number) {
    const modules = await graph.getModules()
    const linkedPaths = (await getLinkedSources(this)).map((s) => s.path)
    const paths = [this.projectRoot, ...linkedPaths]
    this.watcher = new Watcher(this, this.log, paths, modules, bufferInterval)
  }

  private registerPlugin(nameOrPlugin: RegisterPluginParam) {
    let plugin: GardenPlugin

    if (isString(nameOrPlugin)) {
      let moduleNameOrLocation = nameOrPlugin

      // allow relative references to project root
      if (parse(moduleNameOrLocation).dir !== "") {
        moduleNameOrLocation = resolve(this.projectRoot, moduleNameOrLocation)
      }

      let pluginModule: any

      try {
        pluginModule = require(moduleNameOrLocation)
      } catch (error) {
        throw new ConfigurationError(
          `Unable to load plugin "${moduleNameOrLocation}" (could not load module: ${error.message})`,
          {
            message: error.message,
            moduleNameOrLocation,
          }
        )
      }

      try {
        pluginModule = validateSchema(pluginModule, pluginModuleSchema(), {
          context: `plugin module "${moduleNameOrLocation}"`,
        })
      } catch (err) {
        throw new PluginError(`Unable to load plugin: ${err}`, {
          moduleNameOrLocation,
          err,
        })
      }

      plugin = pluginModule.gardenPlugin
    } else {
      plugin = nameOrPlugin
    }

    this.registeredPlugins[plugin.name] = plugin
  }

  async getPlugin(pluginName: string): Promise<GardenPlugin> {
    const plugins = await this.getPlugins()
    const plugin = findByName(plugins, pluginName)

    if (!plugin) {
      const availablePlugins = getNames(plugins)
      throw new PluginError(
        `Could not find plugin '${pluginName}'. Are you missing a provider configuration? ` +
          `Currently configured plugins: ${availablePlugins.join(", ")}`,
        {
          pluginName,
          availablePlugins,
        }
      )
    }

    return plugin
  }

  async getPlugins() {
    // The duplicated check is a small optimization to avoid the async lock when possible,
    // since this is called quite frequently.
    if (this.loadedPlugins) {
      return this.loadedPlugins
    }

    await this.asyncLock.acquire("load-plugins", async () => {
      // This check is necessary since we could in theory have two calls waiting for the lock at the same time.
      if (this.loadedPlugins) {
        return
      }

      this.log.silly(`Loading plugins`)
      const rawConfigs = this.getRawProviderConfigs()

      this.loadedPlugins = loadPlugins(this.log, this.registeredPlugins, rawConfigs)

      this.log.silly(`Loaded plugins: ${rawConfigs.map((c) => c.name).join(", ")}`)
    })

    return this.loadedPlugins
  }

  /**
   * Returns a mapping of all configured module types in the project and their definitions.
   */
  async getModuleTypes(): Promise<ModuleTypeMap> {
    const plugins = await this.getPlugins()
    const configNames = keyBy(this.getRawProviderConfigs(), "name")
    const configuredPlugins = plugins.filter((p) => configNames[p.name])

    return getModuleTypes(configuredPlugins)
  }

  getRawProviderConfigs(names?: string[]) {
    return names ? findByNames(names, this.providerConfigs, "provider") : this.providerConfigs
  }

  async resolveProvider(name: string) {
    this.log.silly(`Resolving provider ${name}`)
    if (name === "_default") {
      return defaultProvider
    }

    if (this.resolvedProviders[name]) {
      return this.resolvedProviders[name]
    }

    const providers = await this.resolveProviders(false, [name])
    const provider = findByName(providers, name)

    if (!provider) {
      const providerNames = providers.map((p) => p.name)
      throw new PluginError(
        `Could not find provider '${name}' in environment '${this.environmentName}' ` +
          `(configured providers: ${providerNames.join(", ")})`,
        {
          name,
          providers,
        }
      )
    }

    return provider
  }

  async resolveProviders(forceInit = false, names?: string[]): Promise<Provider[]> {
    let providers: Provider[] = []

    await this.asyncLock.acquire("resolve-providers", async () => {
      const rawConfigs = this.getRawProviderConfigs(names)

      if (!names) {
        names = getNames(rawConfigs)
      }

      // As an optimization, we return immediately if all requested providers are already resolved
      const alreadyResolvedProviders = names.map((name) => this.resolvedProviders[name]).filter(Boolean)
      if (alreadyResolvedProviders.length === names.length) {
        providers = alreadyResolvedProviders
        return
      }

      this.log.silly(`Resolving providers`)

      const log = this.log.info({
        section: "providers",
        msg: "Getting status...",
        status: "active",
      })

      const plugins = keyBy(await this.getPlugins(), "name")

      // Detect circular dependencies here
      const validationGraph = new DependencyValidationGraph()

      await Bluebird.map(rawConfigs, async (config) => {
        const plugin = plugins[config.name]
        validationGraph.addNode(plugin.name)

        for (const dep of await getAllProviderDependencyNames(plugin!, config!)) {
          validationGraph.addNode(dep)
          validationGraph.addDependency(plugin.name, dep)
        }
      })

      const cycles = validationGraph.detectCircularDependencies()

      if (cycles.length > 0) {
        const description = validationGraph.cyclesToString(cycles)
        throw new PluginError(
          `One or more circular dependencies found between providers or their configurations:\n\n${description}`,
          { "circular-dependencies": description }
        )
      }

      const tasks = rawConfigs.map((config) => {
        const plugin = plugins[config.name]

        return new ResolveProviderTask({
          garden: this,
          log,
          plugin,
          config,
          version: this.version,
          forceInit,
        })
      })

      // Process as many providers in parallel as possible
      const taskResults = await this.processTasks(tasks, { unlimitedConcurrency: true })

      const failed = Object.values(taskResults).filter((r) => r && r.error)

      if (failed.length) {
        const messages = failed.map((r) => `- ${r!.name}: ${r!.error!.message}`)
        const failedNames = failed.map((r) => r!.name)
        throw new PluginError(`Failed resolving one or more providers:\n- ${failedNames.join("\n- ")}`, {
          rawConfigs,
          taskResults,
          messages,
        })
      }

      providers = Object.values(taskResults).map((result) => result!.output)

      await Bluebird.map(providers, async (provider) =>
        Bluebird.map(provider.moduleConfigs, async (moduleConfig) => {
          // Make sure module and all nested entities are scoped to the plugin
          moduleConfig.plugin = provider.name
          return this.addModule(moduleConfig)
        })
      )

      for (const provider of providers) {
        this.resolvedProviders[provider.name] = provider
      }

      log.setSuccess({ msg: chalk.green("Done"), append: true })
      this.log.silly(`Resolved providers: ${providers.map((p) => p.name).join(", ")}`)
    })

    return providers
  }

  /**
   * Returns the reported status from all configured providers.
   */
  async getEnvironmentStatus() {
    const providers = await this.resolveProviders()
    return fromPairs(providers.map((p) => [p.name, p.status]))
  }

  async getActionRouter() {
    if (!this.actionHelper) {
      const loadedPlugins = await this.getPlugins()
      const moduleTypes = await this.getModuleTypes()
      const plugins = keyBy(loadedPlugins, "name")

      // We only pass configured plugins to the router (others won't have the required configuration to call handlers)
      const configuredPlugins = this.getRawProviderConfigs().map((c) => plugins[c.name])

      this.actionHelper = new ActionRouter(this, configuredPlugins, loadedPlugins, moduleTypes)
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

    return Object.values(keys ? pickKeys(this.moduleConfigs, keys, "module") : this.moduleConfigs)
  }

  async getModuleConfigContext(runtimeContext?: RuntimeContext) {
    const providers = await this.resolveProviders()
    return new ModuleConfigContext(this, providers, this.variables, Object.values(this.moduleConfigs), runtimeContext)
  }

  async getOutputConfigContext(runtimeContext: RuntimeContext) {
    const providers = await this.resolveProviders()
    return new OutputConfigContext(this, providers, this.variables, Object.values(this.moduleConfigs), runtimeContext)
  }

  /**
   * Returns module configs that are registered in this context, fully resolved and configured (via their respective
   * plugin handlers).
   * Scans for modules in the project root and remote/linked sources if it hasn't already been done.
   */
  private async resolveModuleConfigs(
    log: LogEntry,
    keys?: string[],
    opts: ModuleConfigResolveOpts = {}
  ): Promise<ModuleConfig[]> {
    const providers = await this.resolveProviders()
    const configs = await this.getRawModuleConfigs(keys)

    keys ? log.silly(`Resolving module configs ${keys.join(", ")}`) : this.log.silly(`Resolving module configs`)

    if (!opts.configContext) {
      opts.configContext = await this.getModuleConfigContext()
    }

    // Resolve the project module configs
    const moduleConfigs = await Bluebird.map(configs, (config) => resolveModuleConfig(this, config, opts))
    const actions = await this.getActionRouter()
    const moduleTypes = await this.getModuleTypes()

    let graph: ConfigGraph | undefined = undefined

    // Require include/exclude on modules if their paths overlap
    const overlaps = detectModuleOverlap(moduleConfigs)
    if (overlaps.length > 0) {
      const { message, detail } = this.makeOverlapError(overlaps)
      throw new ConfigurationError(message, detail)
    }

    // Walk through all plugins in dependency order, and allow them to augment the graph
    for (const provider of getDependencyOrder(providers, this.registeredPlugins)) {
      // Skip the routine if the provider doesn't have the handler
      const handler = await actions.getActionHandler({
        actionType: "augmentGraph",
        pluginName: provider.name,
        throwIfMissing: false,
      })

      if (!handler) {
        continue
      }

      // We clear the graph below whenever an augmentGraph handler adds/modifies modules, and re-init here
      if (!graph) {
        graph = new ConfigGraph(this, moduleConfigs, moduleTypes)
      }

      const { addBuildDependencies, addRuntimeDependencies, addModules } = await actions.augmentGraph({
        pluginName: provider.name,
        log,
        providers,
        modules: await graph.getModules(),
      })

      // Resolve module configs from specs and add to the list
      await Bluebird.map(addModules || [], async (spec) => {
        const path = spec.path || this.projectRoot
        const moduleConfig = prepareModuleResource(spec, path, path, this.projectRoot)
        moduleConfigs.push(await resolveModuleConfig(this, moduleConfig, opts))
        graph = undefined
      })

      // Note: For both kinds of dependencies we only validate that `by` resolves correctly, since the rest
      // (i.e. whether all `on` references exist + circular deps) will be validated when initiating the ConfigGraph.
      for (const dependency of addBuildDependencies || []) {
        const by = findByName(moduleConfigs, dependency.by)

        if (!by) {
          throw new PluginError(
            deline`
              Provider '${provider.name}' added a build dependency by module '${dependency.by}' on '${dependency.on}'
              but module '${dependency.by}' could not be found.
            `,
            { provider, dependency }
          )
        }

        // TODO: allow copy directives on build dependencies?
        by.build.dependencies.push({ name: dependency.on, copy: [] })
        graph = undefined
      }

      for (const dependency of addRuntimeDependencies || []) {
        let found = false

        for (const moduleConfig of moduleConfigs) {
          for (const serviceConfig of moduleConfig.serviceConfigs) {
            if (serviceConfig.name === dependency.by) {
              serviceConfig.dependencies.push(dependency.on)
              found = true
            }
          }
          for (const taskConfig of moduleConfig.taskConfigs) {
            if (taskConfig.name === dependency.by) {
              taskConfig.dependencies.push(dependency.on)
              found = true
            }
          }
        }

        if (!found) {
          throw new PluginError(
            deline`
              Provider '${provider.name}' added a runtime dependency by '${dependency.by}' on '${dependency.on}'
              but service or task '${dependency.by}' could not be found.
            `,
            { provider, dependency }
          )
        }

        graph = undefined
      }
    }

    return moduleConfigs
  }

  /**
   * Returns the module with the specified name. Throws error if it doesn't exist.
   */
  async resolveModuleConfig(log: LogEntry, name: string, opts: ModuleConfigResolveOpts = {}): Promise<ModuleConfig> {
    return (await this.resolveModuleConfigs(log, [name], opts))[0]
  }

  /**
   * Resolve the raw module configs and return a new instance of ConfigGraph.
   * The graph instance is immutable and represents the configuration at the point of calling this method.
   * For long-running processes, you need to call this again when any module or configuration has been updated.
   */
  async getConfigGraph(log: LogEntry, opts: ModuleConfigResolveOpts = {}) {
    const modules = await this.resolveModuleConfigs(log, undefined, opts)
    const moduleTypes = await this.getModuleTypes()
    return new ConfigGraph(this, modules, moduleTypes)
  }

  /**
   * Given a module, and a list of dependencies, resolve the version for that combination of modules.
   * The combined version is a either the latest dirty module version (if any), or the hash of the module version
   * and the versions of its dependencies (in sorted order).
   */
  async resolveVersion(
    moduleConfig: ModuleConfig,
    moduleDependencies: (Module | BuildDependencyConfig)[],
    force = false
  ) {
    const moduleName = moduleConfig.name
    this.log.silly(`Resolving version for module ${moduleName}`)

    const depModuleNames = moduleDependencies.map((m) => m.name)
    depModuleNames.sort()
    const cacheKey = ["moduleVersions", moduleName, ...depModuleNames]

    if (!force) {
      const cached = <ModuleVersion>this.cache.get(cacheKey)

      if (cached) {
        return cached
      }
    }

    const dependencyKeys = moduleDependencies.map((dep) => getModuleKey(dep.name, dep.plugin))
    const dependencies = await this.getRawModuleConfigs(dependencyKeys)
    const cacheContexts = dependencies.concat([moduleConfig]).map((c) => getModuleCacheContext(c))

    const version = await this.vcs.resolveVersion(this.log, moduleConfig, dependencies)

    this.cache.set(cacheKey, version, ...cacheContexts)
    return version
  }

  /**
   * Scans the specified directories for Garden config files and returns a list of paths.
   */
  async scanForConfigs(path: string) {
    this.log.silly(`Scanning for configs in ${path}`)

    return findConfigPathsInPath({
      vcs: this.vcs,
      dir: path,
      include: this.moduleIncludePatterns,
      exclude: this.moduleExcludePatterns,
      log: this.log,
    })
  }

  /*
    Scans the project root for modules and adds them to the context.
   */
  async scanModules(force = false) {
    return this.asyncLock.acquire("scan-modules", async () => {
      if (this.modulesScanned && !force) {
        return
      }

      this.log.silly(`Scanning for modules`)

      let extSourcePaths: string[] = []

      // Add external sources that are defined at the project level. External sources are either kept in
      // the .garden/sources dir (and cloned there if needed), or they're linked to a local path via the link command.
      for (const { name, repositoryUrl } of this.projectSources) {
        const path = await this.loadExtSourcePath({
          name,
          repositoryUrl,
          sourceType: "project",
        })
        extSourcePaths.push(path)
      }

      const dirsToScan = [this.projectRoot, ...extSourcePaths]
      const modulePaths = flatten(await Bluebird.map(dirsToScan, (path) => this.scanForConfigs(path)))

      const rawConfigs: ModuleConfig[] = [...this.pluginModuleConfigs]

      await Bluebird.map(modulePaths, async (path) => {
        const configs = await this.loadModuleConfigs(dirname(path))
        if (configs) {
          rawConfigs.push(...configs)
        }
      })

      await Bluebird.map(rawConfigs, async (config) => this.addModule(config))

      this.log.silly(`Scanned and found ${rawConfigs.length} modules`)

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
  private async addModule(config: ModuleConfig) {
    const key = getModuleKey(config.name, config.plugin)
    this.log.silly(`Adding module ${key}`)

    if (this.moduleConfigs[key]) {
      const paths = [this.moduleConfigs[key].path, config.path]
      const [pathA, pathB] = (
        await Bluebird.map(paths, async (path) => relative(this.projectRoot, await getConfigFilePath(path)))
      ).sort()

      throw new ConfigurationError(`Module ${key} is declared multiple times (in '${pathA}' and '${pathB}')`, {
        pathA,
        pathB,
      })
    }

    this.moduleConfigs[key] = config
  }

  /**
   * Load a module from the specified directory and return the config, or null if no module is found.
   *
   * @param path Directory containing the module
   */
  private async loadModuleConfigs(path: string): Promise<ModuleConfig[]> {
    path = resolve(this.projectRoot, path)
    this.log.silly(`Load module configs from ${path}`)
    const resources = await loadConfig(this.projectRoot, path)
    this.log.silly(`Loaded module configs from ${path}`)
    return <ModuleResource[]>resources.filter((r) => r.kind === "Module")
  }

  //===========================================================================
  //region Internal helpers
  //===========================================================================

  /**
   * Clones the project/module source if needed and returns the path (either from .garden/sources or from a local path)
   */
  public async loadExtSourcePath({
    name,
    repositoryUrl,
    sourceType,
  }: {
    name: string
    repositoryUrl: string
    sourceType: ExternalSourceType
  }): Promise<string> {
    const linkedSources = await getLinkedSources(this, sourceType)

    const linked = findByName(linkedSources, name)

    if (linked) {
      return linked.path
    }

    const path = await this.vcs.ensureRemoteSource({
      name,
      sourceType,
      url: repositoryUrl,
      log: this.log,
    })

    return path
  }

  public makeOverlapError(moduleOverlaps: ModuleOverlap[]) {
    const overlapList = moduleOverlaps
      .map(({ module, overlaps }) => {
        const formatted = overlaps.map((o) => {
          const detail = o.path === module.path ? "same path" : "nested"
          return `${chalk.bold(o.name)} (${detail})`
        })
        return `Module ${chalk.bold(module.name)} overlaps with module(s) ${naturalList(formatted)}.`
      })
      .join("\n\n")
    const message = chalk.red(dedent`
      Missing ${chalk.bold("include")} and/or ${chalk.bold("exclude")} directives on modules with overlapping paths.
      Setting includes/excludes is required when modules have the same path (i.e. are in the same garden.yml file),
      or when one module is nested within another.

      ${overlapList}
    `)
    // Sanitize error details
    const overlappingModules = moduleOverlaps.map(({ module, overlaps }) => {
      return {
        module: { name: module.name, path: resolve(this.projectRoot, module.path) },
        overlaps: overlaps.map(({ name, path }) => ({ name, path: resolve(this.projectRoot, path) })),
      }
    })
    return { message, detail: { overlappingModules } }
  }

  /**
   * This dumps the full project configuration including all modules.
   */
  public async dumpConfig(log: LogEntry): Promise<ConfigDump> {
    return {
      environmentName: this.environmentName,
      providers: await this.resolveProviders(),
      variables: this.variables,
      moduleConfigs: sortBy(await this.resolveModuleConfigs(log), "name"),
      projectRoot: this.projectRoot,
    }
  }

  //endregion
}

export interface ConfigDump {
  environmentName: string
  providers: Provider[]
  variables: PrimitiveMap
  moduleConfigs: ModuleConfig[]
  projectRoot: string
}
