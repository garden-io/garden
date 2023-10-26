/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { ensureDir } from "fs-extra"
import { platform, arch } from "os"
import { relative, resolve } from "path"
import cloneDeep from "fast-copy"
import { flatten, sortBy, keyBy, mapValues, groupBy, set } from "lodash"
import AsyncLock from "async-lock"

import { TreeCache } from "./cache"
import { getBuiltinPlugins } from "./plugins/plugins"
import { GardenModule, getModuleCacheContext, ModuleConfigMap, ModuleTypeMap } from "./types/module"
import {
  SourceConfig,
  ProjectConfig,
  resolveProjectConfig,
  pickEnvironment,
  OutputSpec,
  parseEnvironment,
  getDefaultEnvironmentName,
  projectSourcesSchema,
  ProxyConfig,
  defaultNamespace,
  defaultEnvironment,
} from "./config/project"
import {
  findByName,
  pickKeys,
  getPackageVersion,
  getNames,
  findByNames,
  duplicatesByKey,
  getCloudDistributionName,
  getCloudLogSectionName,
} from "./util/util"
import {
  ConfigurationError,
  GardenError,
  PluginError,
  RuntimeError,
  InternalError,
  toGardenError,
  CircularDependenciesError,
} from "./exceptions"
import { VcsHandler, ModuleVersion, getModuleVersionString, VcsInfo } from "./vcs/vcs"
import { GitHandler } from "./vcs/git"
import { BuildStaging } from "./build-staging/build-staging"
import { ConfigGraph, ResolvedConfigGraph } from "./graph/config-graph"
import { getRootLogger } from "./logger/logger"
import { GardenPluginSpec } from "./plugin/plugin"
import {
  loadConfigResources,
  findProjectConfig,
  GardenResource,
  configTemplateKind,
  renderTemplateKind,
} from "./config/base"
import { DeepPrimitiveMap, StringMap, PrimitiveMap, treeVersionSchema, joi, allowUnknown } from "./config/common"
import { GlobalConfigStore } from "./config-store/global"
import { LocalConfigStore, LinkedSource } from "./config-store/local"
import { getLinkedSources, ExternalSourceType } from "./util/ext-source-util"
import { ModuleConfig } from "./config/module"
import { convertModules, ModuleResolver } from "./resolve-module"
import { createPluginContext, CommandInfo, PluginEventBroker } from "./plugin-context"
import { RegisterPluginParam } from "./plugin/plugin"
import {
  SUPPORTED_PLATFORMS,
  DEFAULT_GARDEN_DIR_NAME,
  gardenEnv,
  SUPPORTED_ARCHITECTURES,
  GardenApiVersion,
  DOCS_BASE_URL,
  DEFAULT_GARDEN_CLOUD_DOMAIN,
} from "./constants"
import { Log } from "./logger/log-entry"
import { EventBus } from "./events/events"
import { Watcher } from "./watch"
import {
  findConfigPathsInPath,
  getWorkingCopyId,
  fixedProjectExcludes,
  defaultConfigFilename,
  defaultDotIgnoreFile,
} from "./util/fs"
import {
  Provider,
  GenericProviderConfig,
  getAllProviderDependencyNames,
  defaultProvider,
  ProviderMap,
} from "./config/provider"
import { ResolveProviderTask } from "./tasks/resolve-provider"
import { ActionRouter } from "./router/router"
import {
  loadAndResolvePlugins,
  getDependencyOrder,
  getModuleTypes,
  loadPlugin,
  getActionTypes,
  ActionDefinitionMap,
  getActionTypeBases,
  ActionTypeMap,
} from "./plugins"
import { dedent, deline, naturalList, wordWrap } from "./util/string"
import { DependencyGraph } from "./graph/common"
import { Profile, profileAsync } from "./util/profiling"
import username from "username"
import {
  throwOnMissingSecretKeys,
  resolveTemplateString,
  resolveTemplateStrings,
} from "./template-string/template-string"
import { WorkflowConfig, WorkflowConfigMap, resolveWorkflowConfig, isWorkflowConfig } from "./config/workflow"
import { PluginTool, PluginTools } from "./util/ext-tools"
import { ConfigTemplateResource, resolveConfigTemplate, ConfigTemplateConfig } from "./config/config-template"
import { TemplatedModuleConfig } from "./plugins/templated"
import { BuildStagingRsync } from "./build-staging/rsync"
import {
  DefaultEnvironmentContext,
  ProjectConfigContext,
  RemoteSourceConfigContext,
} from "./config/template-contexts/project"
import { CloudApi, CloudProject } from "./cloud/api"
import { OutputConfigContext } from "./config/template-contexts/module"
import { ProviderConfigContext } from "./config/template-contexts/provider"
import type { ConfigContext } from "./config/template-contexts/base"
import { validateSchema, validateWithPath } from "./config/validation"
import { pMemoizeDecorator } from "./lib/p-memoize"
import { ModuleGraph } from "./graph/modules"
import {
  Action,
  ActionConfigMap,
  ActionConfigsByKey,
  ActionKind,
  actionKinds,
  ActionModeMap,
  BaseActionConfig,
} from "./actions/types"
import { actionIsDisabled, actionReferenceToString, isActionConfig } from "./actions/base"
import { GraphSolver, SolveOpts, SolveParams, SolveResult } from "./graph/solver"
import { actionConfigsToGraph, actionFromConfig, executeAction, resolveAction, resolveActions } from "./graph/actions"
import { ActionTypeDefinition } from "./plugin/action-types"
import type { Task } from "./tasks/base"
import { GraphResultFromTask, GraphResults } from "./graph/results"
import { uuidv4 } from "./util/random"
import { convertTemplatedModuleToRender, RenderTemplateConfig, renderConfigTemplate } from "./config/render-template"
import { MonitorManager } from "./monitors/manager"
import { AnalyticsHandler } from "./analytics/analytics"
import { getGardenInstanceKey } from "./server/helpers"
import { SuggestedCommand } from "./commands/base"
import { OtelTraced } from "./util/open-telemetry/decorators"
import { wrapActiveSpan } from "./util/open-telemetry/spans"
import { GitRepoHandler } from "./vcs/git-repo"
import { configureNoOpExporter } from "./util/open-telemetry/tracing"
import { detectModuleOverlap, makeOverlapErrors } from "./util/module-overlap"

const defaultLocalAddress = "localhost"

export interface GardenOpts {
  commandInfo: CommandInfo
  config?: ProjectConfig
  environmentString?: string // Note: This is the string, as e.g. passed with the --env flag
  forceRefresh?: boolean
  gardenDirPath?: string
  globalConfigStore?: GlobalConfigStore
  legacyBuildSync?: boolean
  log?: Log
  monitors?: MonitorManager
  noEnterprise?: boolean
  persistent?: boolean
  plugins?: RegisterPluginParam[]
  sessionId?: string
  variableOverrides?: PrimitiveMap
  cloudApi?: CloudApi
}

export interface GardenParams {
  artifactsPath: string
  vcsInfo: VcsInfo
  projectId?: string
  cloudDomain?: string
  cache: TreeCache
  dotIgnoreFile: string
  proxy: ProxyConfig
  environmentName: string
  resolvedDefaultNamespace: string | null
  namespace: string
  gardenDirPath: string
  globalConfigStore?: GlobalConfigStore
  localConfigStore?: LocalConfigStore
  log: Log
  moduleIncludePatterns?: string[]
  moduleExcludePatterns?: string[]
  monitors?: MonitorManager
  opts: GardenOpts
  outputs: OutputSpec[]
  plugins: RegisterPluginParam[]
  production: boolean
  projectConfig: ProjectConfig
  projectName: string
  projectRoot: string
  projectSources?: SourceConfig[]
  providerConfigs: GenericProviderConfig[]
  variables: DeepPrimitiveMap
  variableOverrides: DeepPrimitiveMap
  secrets: StringMap
  sessionId: string
  username: string | undefined
  workingCopyId: string
  forceRefresh?: boolean
  cloudApi?: CloudApi | null
  projectApiVersion: ProjectConfig["apiVersion"]
}

interface GardenInstanceState {
  configsScanned: boolean
  needsReload: boolean
}

@Profile()
export class Garden {
  public log: Log
  private loadedPlugins?: GardenPluginSpec[]
  protected actionConfigs: ActionConfigMap
  protected moduleConfigs: ModuleConfigMap
  protected workflowConfigs: WorkflowConfigMap
  protected configPaths: Set<string>
  private resolvedProviders: { [key: string]: Provider }
  protected readonly state: GardenInstanceState
  protected registeredPlugins: RegisterPluginParam[]
  private readonly solver: GraphSolver
  private asyncLock: AsyncLock
  public readonly projectId?: string
  public readonly cloudDomain?: string
  public sessionId: string
  public readonly localConfigStore: LocalConfigStore
  public globalConfigStore: GlobalConfigStore
  public readonly vcs: VcsHandler
  public readonly treeCache: TreeCache
  public events: EventBus
  private tools?: { [key: string]: PluginTool }
  public configTemplates: { [name: string]: ConfigTemplateConfig }
  private actionTypeBases: ActionTypeMap<ActionTypeDefinition<any>[]>
  private emittedWarnings: Set<string>
  public cloudApi: CloudApi | null

  public readonly production: boolean
  public readonly projectRoot: string
  public readonly projectName: string
  public readonly projectApiVersion: string
  public readonly environmentName: string
  /**
   * The resolved default namespace as defined in the Project config for the current environment.
   */
  public readonly resolvedDefaultNamespace: string | null
  /**
   * The actual namespace for the Garden instance. This is by default the namespace defined in the Project config
   * for the current environment but can be overwritten with the `--env` flag.
   */
  public readonly namespace: string
  public readonly variables: DeepPrimitiveMap
  // Any variables passed via the `--var` CLI option (maintained here so that they can be used during module resolution
  // to override module variables and module varfiles).
  public readonly variableOverrides: DeepPrimitiveMap
  public readonly secrets: StringMap
  private readonly projectSources: SourceConfig[]
  public readonly buildStaging: BuildStaging
  public readonly gardenDirPath: string
  public readonly artifactsPath: string
  public readonly vcsInfo: VcsInfo
  public readonly opts: GardenOpts
  private readonly projectConfig: ProjectConfig
  private readonly providerConfigs: GenericProviderConfig[]
  public readonly workingCopyId: string
  public readonly dotIgnoreFile: string
  public readonly proxy: ProxyConfig
  public readonly moduleIncludePatterns?: string[]
  public readonly moduleExcludePatterns: string[]
  public readonly persistent: boolean
  public readonly rawOutputs: OutputSpec[]
  public readonly username?: string
  public readonly version: string
  private readonly forceRefresh: boolean
  public readonly commandInfo: CommandInfo
  public readonly monitors: MonitorManager
  public readonly nestedSessions: Map<string, Garden>

  // Used internally for introspection
  public readonly isGarden: true

  constructor(params: GardenParams) {
    this.projectId = params.projectId
    this.cloudDomain = params.cloudDomain
    this.sessionId = params.sessionId
    this.environmentName = params.environmentName
    this.resolvedDefaultNamespace = params.resolvedDefaultNamespace
    this.namespace = params.namespace
    this.gardenDirPath = params.gardenDirPath
    this.log = params.log
    this.artifactsPath = params.artifactsPath
    this.vcsInfo = params.vcsInfo
    this.opts = params.opts
    this.rawOutputs = params.outputs
    this.production = params.production
    this.projectConfig = params.projectConfig
    this.projectName = params.projectName
    this.projectRoot = params.projectRoot
    this.projectSources = params.projectSources || []
    this.projectApiVersion = params.projectApiVersion
    this.providerConfigs = params.providerConfigs
    this.variables = params.variables
    this.variableOverrides = params.variableOverrides
    this.secrets = params.secrets
    this.workingCopyId = params.workingCopyId
    this.dotIgnoreFile = params.dotIgnoreFile
    this.proxy = params.proxy
    this.moduleIncludePatterns = params.moduleIncludePatterns
    this.moduleExcludePatterns = params.moduleExcludePatterns || []
    this.persistent = !!params.opts.persistent
    this.username = params.username
    this.forceRefresh = !!params.forceRefresh
    this.cloudApi = params.cloudApi || null
    this.commandInfo = params.opts.commandInfo
    this.treeCache = params.cache
    this.isGarden = true
    this.configTemplates = {}
    this.emittedWarnings = new Set()
    this.state = { configsScanned: false, needsReload: false }
    this.nestedSessions = new Map()

    this.asyncLock = new AsyncLock()

    const gitMode = gardenEnv.GARDEN_GIT_SCAN_MODE || params.projectConfig.scan?.git?.mode
    const handlerCls = gitMode === "repo" ? GitRepoHandler : GitHandler

    this.vcs = new handlerCls({
      garden: this,
      projectRoot: params.projectRoot,
      gardenDirPath: params.gardenDirPath,
      ignoreFile: params.dotIgnoreFile,
      cache: params.cache,
    })

    // Use the legacy build sync mode if
    // A) GARDEN_LEGACY_BUILD_STAGE=true is set or
    // B) if running Windows and GARDEN_EXPERIMENTAL_BUILD_STAGE != true (until #2299 is properly fixed)
    const legacyBuildSync =
      params.opts.legacyBuildSync === undefined
        ? gardenEnv.GARDEN_LEGACY_BUILD_STAGE || (platform() === "win32" && !gardenEnv.GARDEN_EXPERIMENTAL_BUILD_STAGE)
        : params.opts.legacyBuildSync

    const buildDirCls = legacyBuildSync ? BuildStagingRsync : BuildStaging
    if (legacyBuildSync) {
      this.log.silly(`Using rsync build staging mode`)
    }
    this.buildStaging = new buildDirCls(params.projectRoot, params.gardenDirPath)

    // make sure we're on a supported platform
    const currentPlatform = platform()
    const currentArch = arch() as NodeJS.Architecture

    if (!SUPPORTED_PLATFORMS.includes(currentPlatform)) {
      throw new RuntimeError({
        message: `Unsupported platform: ${currentPlatform}`,
      })
    }

    if (!SUPPORTED_ARCHITECTURES.includes(currentArch)) {
      throw new RuntimeError({
        message: `Unsupported CPU architecture: ${currentArch}`,
      })
    }

    this.state.configsScanned = false
    // TODO: Support other VCS options.
    this.localConfigStore = params.localConfigStore || new LocalConfigStore(this.gardenDirPath)
    this.globalConfigStore = params.globalConfigStore || new GlobalConfigStore()

    this.actionConfigs = {
      Build: {},
      Deploy: {},
      Run: {},
      Test: {},
    }
    this.actionTypeBases = {
      Build: {},
      Deploy: {},
      Run: {},
      Test: {},
    }
    this.moduleConfigs = {}
    this.workflowConfigs = {}
    this.configPaths = new Set<string>()
    this.registeredPlugins = [...getBuiltinPlugins(), ...params.plugins]
    this.resolvedProviders = {}

    this.events = new EventBus({ gardenKey: this.getInstanceKey() })
    // TODO: actually resolve version, based on the VCS version of the plugin and its dependencies
    this.version = getPackageVersion()
    this.monitors = params.monitors || new MonitorManager(this.log, this.events)
    this.solver = new GraphSolver(this)

    // In order not to leak memory, we should ensure that there's always a collector for the OTEL data
    // Here we check if the otel-collector was configured and we set a NoOp exporter if it was not
    // This is of course not entirely ideal since this puts into this class some level of coupling
    // with the plugin based otel-collector.
    // Since we don't have the ability to hook into the post provider init stage from within the provider plugin
    // especially because it's the absence of said provider that needs to trigger this case,
    // there isn't really a cleaner way around this for now.
    const providerConfigs = this.getRawProviderConfigs()

    const hasOtelCollectorProvider = providerConfigs.some((providerConfig) => {
      return providerConfig.name === "otel-collector"
    })

    if (!hasOtelCollectorProvider) {
      this.log.silly("No OTEL collector configured, setting no-op exporter")
      configureNoOpExporter()
    }
  }

  static async factory<T extends typeof Garden>(
    this: T,
    currentDirectory: string,
    opts: GardenOpts
  ): Promise<InstanceType<T>> {
    const garden = new this(await resolveGardenParams(currentDirectory, opts)) as InstanceType<T>

    // Make sure the project root is in a git repo
    await garden.getRepoRoot()

    return garden
  }

  /**
   * Clean up before shutting down.
   */
  close() {
    this.events.removeAllListeners()
    Watcher.getInstance({ log: this.log }).unsubscribe(this.events)
  }

  /**
   * Returns a shallow clone of this instance. Useful if you need to override properties for a specific context.
   */
  clone(): Garden {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this)
  }

  cloneForCommand(sessionId: string, cloudApi?: CloudApi): Garden {
    // Make an instance clone to override anything that needs to be scoped to a specific command run
    // TODO: this could be made more elegant
    const garden = this.clone()
    const parentSessionId = this.sessionId
    this.nestedSessions.set(sessionId, garden)
    garden.sessionId = sessionId

    garden.log = garden.log.createLog()
    garden.log.context.sessionId = sessionId
    garden.log.context.parentSessionId = parentSessionId

    if (cloudApi) {
      garden.cloudApi = cloudApi
    }

    const parentEvents = garden.events
    garden.events = new EventBus({ gardenKey: garden.getInstanceKey(), sessionId })
    // We make sure events emitted in the context of the command are forwarded to the parent Garden event bus.
    garden.events.onAny((name, payload) => {
      parentEvents.emit(name, payload)
    })

    return garden
  }

  needsReload(v?: true) {
    if (v) {
      this.state.needsReload = true
    }
    return this.state.needsReload
  }

  /**
   * Get the repository root for the project.
   */
  async getRepoRoot() {
    return this.vcs.getRepoRoot(this.log, this.projectRoot)
  }

  /**
   * Returns a new PluginContext, i.e. the `ctx` object that's passed to plugin handlers.
   *
   * The object contains a helper to resolve template strings. By default the templating context is set to the
   * provider template context. Callers should specify the appropriate templating for the handler that will be
   * called with the PluginContext.
   */
  async getPluginContext({
    provider,
    templateContext,
    events,
  }: {
    provider: Provider
    templateContext: ConfigContext | undefined
    events: PluginEventBroker | undefined
  }) {
    return createPluginContext({
      garden: this,
      provider,
      command: this.opts.commandInfo,
      templateContext: templateContext || new ProviderConfigContext(this, provider.dependencies, this.variables),
      events,
    })
  }

  getProjectConfigContext() {
    const loggedIn = this.isLoggedIn()
    const enterpriseDomain = this.cloudApi?.domain
    return new ProjectConfigContext({ ...this, loggedIn, enterpriseDomain })
  }

  async clearBuilds() {
    return this.buildStaging.clear()
  }

  clearCaches() {
    this.treeCache.clear()
    this.solver.clearCache()
  }

  async emitWarning({ key, log, message }: { key: string; log: Log; message: string }) {
    await this.asyncLock.acquire("emitWarning", async () => {
      // Only emit a warning once per instance
      if (this.emittedWarnings.has(key)) {
        return
      }

      const existing = await this.localConfigStore.get("warnings", key)

      if (!existing || !existing.hidden) {
        this.emittedWarnings.add(key)
        log.warn(message + `\n→ Run ${chalk.underline(`garden util hide-warning ${key}`)} to disable this warning.`)
      }
    })
  }

  async hideWarning(key: string) {
    await this.localConfigStore.set("warnings", key, { hidden: true })
  }

  @pMemoizeDecorator()
  async getAnalyticsHandler() {
    return AnalyticsHandler.init(this, this.log)
  }

  // TODO: would be nice if this returned a type based on the input tasks
  async processTasks(params: SolveParams): Promise<SolveResult> {
    return this.solver.solve(params)
  }

  async processTask<T extends Task>(task: T, log: Log, opts: SolveOpts): Promise<GraphResultFromTask<T> | null> {
    const { results } = await this.solver.solve({ tasks: [task], log, ...opts })
    return results.getResult(task)
  }

  /**
   * Subscribes to watch events for config paths.
   */
  watchPaths() {
    const watcher = Watcher.getInstance({ log: this.log })
    watcher.unsubscribe(this.events)
    watcher.subscribe(this.events, [
      // Watch config files
      ...Array.from(this.configPaths.values()).map((path) => ({ type: "config" as const, path })),
      // TODO: watch source directories when on Windows or Mac (watching on linux is too expensive atm)
    ])
  }

  getProjectConfig() {
    return this.projectConfig
  }

  async getRegisteredPlugins(): Promise<GardenPluginSpec[]> {
    return Promise.all(this.registeredPlugins.map((p) => loadPlugin(this.log, this.projectRoot, p)))
  }

  @pMemoizeDecorator()
  async getPlugin(pluginName: string): Promise<GardenPluginSpec> {
    const plugins = await this.getAllPlugins()
    const plugin = findByName(plugins, pluginName)

    if (!plugin) {
      const availablePlugins = getNames(plugins)
      throw new PluginError({
        message: dedent`
          Could not find plugin '${pluginName}'. Are you missing a provider configuration?

          Currently configured plugins: ${availablePlugins.join(", ")}`,
      })
    }

    return plugin
  }

  /**
   * Returns all registered plugins, loading them if necessary.
   */
  @pMemoizeDecorator()
  @OtelTraced({
    name: "loadPlugins",
  })
  async getAllPlugins() {
    // The duplicated check is a small optimization to avoid the async lock when possible,
    // since this is called quite frequently.
    if (this.loadedPlugins) {
      return this.loadedPlugins
    }

    return this.asyncLock.acquire("load-plugins", async () => {
      // This check is necessary since we could in theory have two calls waiting for the lock at the same time.
      if (this.loadedPlugins) {
        return this.loadedPlugins
      }

      this.log.silly(`Loading plugins`)
      const rawConfigs = this.getRawProviderConfigs()

      this.loadedPlugins = await loadAndResolvePlugins(this.log, this.projectRoot, this.registeredPlugins, rawConfigs)

      this.log.silly(`Loaded plugins: ${this.loadedPlugins.map((c) => c.name).join(", ")}`)

      return this.loadedPlugins
    })
  }

  /**
   * Returns plugins that are currently configured in provider configs.
   */
  @pMemoizeDecorator()
  async getConfiguredPlugins() {
    const plugins = await this.getAllPlugins()
    const configNames = keyBy(this.getRawProviderConfigs(), "name")
    return plugins.filter((p) => configNames[p.name])
  }

  /**
   * Returns a mapping of all configured module types in the project and their definitions.
   */
  @pMemoizeDecorator()
  async getModuleTypes(): Promise<ModuleTypeMap> {
    const configuredPlugins = await this.getConfiguredPlugins()
    return getModuleTypes(configuredPlugins)
  }

  /**
   * Returns a mapping of all configured action types in the project and their definitions.
   */
  @pMemoizeDecorator()
  async getActionTypes(): Promise<ActionDefinitionMap> {
    const configuredPlugins = await this.getConfiguredPlugins()
    return getActionTypes(configuredPlugins)
  }

  /**
   * Get the bases for the given action kind/type, with schemas modified to allow any unknown fields.
   * Used to validate actions whose types inherit from others.
   *
   * Implemented here so that we can cache the modified schemas.
   */
  async getActionTypeBases(kind: ActionKind, type: string) {
    const definitions = await this.getActionTypes()

    if (this.actionTypeBases[kind][type]) {
      return this.actionTypeBases[kind][type] || []
    }

    const bases = getActionTypeBases(definitions[kind][type].spec, definitions[kind])
    this.actionTypeBases[kind][type] = bases.map((b) => ({ ...b, schema: allowUnknown(b.schema) }))
    return this.actionTypeBases[kind][type] || []
  }

  getRawProviderConfigs({ names, allowMissing = false }: { names?: string[]; allowMissing?: boolean } = {}) {
    return names
      ? findByNames({ names, entries: this.providerConfigs, description: "provider", allowMissing })
      : this.providerConfigs
  }

  async resolveProvider(log: Log, name: string) {
    if (name === "_default") {
      return defaultProvider
    }

    if (this.resolvedProviders[name]) {
      return cloneDeep(this.resolvedProviders[name])
    }

    this.log.silly(`Resolving provider ${name}`)

    const providers = await this.resolveProviders(log, false, [name])
    const provider = providers[name]

    if (!provider) {
      const providerNames = Object.keys(providers)
      throw new PluginError({
        message: dedent`
          Could not find provider '${name}' in environment '${this.environmentName}'
          (configured providers: ${providerNames.join(", ") || "<none>"})
        `,
      })
    }

    return provider
  }

  @OtelTraced({
    name: "resolveProviders",
  })
  async resolveProviders(log: Log, forceInit = false, names?: string[]): Promise<ProviderMap> {
    // TODO: split this out of the Garden class
    let providers: Provider[] = []

    await this.asyncLock.acquire("resolve-providers", async () => {
      const rawConfigs = this.getRawProviderConfigs({ names })

      if (!names) {
        names = getNames(rawConfigs)
      }

      throwOnMissingSecretKeys(rawConfigs, this.secrets, "Provider", log)

      // As an optimization, we return immediately if all requested providers are already resolved
      const alreadyResolvedProviders = names.map((name) => this.resolvedProviders[name]).filter(Boolean)
      if (alreadyResolvedProviders.length === names.length) {
        providers = cloneDeep(alreadyResolvedProviders)
        return
      }

      log.silly(`Resolving providers`)

      const providerLog = log.createLog({ name: "providers", showDuration: true })
      providerLog.info("Getting status...")

      const plugins = keyBy(await this.getAllPlugins(), "name")

      // Detect circular dependencies here
      const validationGraph = new DependencyGraph()

      await Promise.all(
        rawConfigs.map(async (config) => {
          const plugin = plugins[config.name]

          if (!plugin) {
            throw new ConfigurationError({
              message: dedent`
                Configured provider '${config.name}' has not been registered.

                Available plugins: ${Object.keys(plugins).join(", ")}
              `,
            })
          }

          validationGraph.addNode(plugin.name)

          for (const dep of await getAllProviderDependencyNames(plugin!, config!)) {
            validationGraph.addNode(dep)
            validationGraph.addDependency(plugin.name, dep)
          }
        })
      )

      const cycles = validationGraph.detectCircularDependencies()

      if (cycles.length > 0) {
        const cyclesSummary = validationGraph.cyclesToString(cycles)
        throw new CircularDependenciesError({
          messagePrefix: "One or more circular dependencies found between providers or their configurations",
          cycles,
          cyclesSummary,
        })
      }

      const tasks = rawConfigs.map((config) => {
        const plugin = plugins[config.name]

        return new ResolveProviderTask({
          garden: this,
          log: providerLog,
          plugin,
          config,
          force: false,
          forceRefresh: this.forceRefresh,
          forceInit,
          allPlugins: Object.values(plugins),
        })
      })

      // Process as many providers in parallel as possible
      const taskResults = await this.processTasks({ tasks, log })

      const providerResults = Object.values(taskResults.results.getMap())

      const failed = providerResults.filter((r) => r && r.error)

      if (failed.length) {
        const failedNames = failed.map((r) => r!.name)

        const wrappedErrors: GardenError[] = failed.flatMap((f) => {
          return f && f.error ? [toGardenError(f.error)] : []
        })

        // we do not include the error messages in the message, because we already log those errors in the solver.
        throw new PluginError({
          message: `Failed resolving one or more providers:\n- ${failedNames.join("\n- ")}`,
          wrappedErrors,
        })
      }

      providers = providerResults.map((result) => result!.result)

      const gotCachedResult = !!providers.find((p) => p.status.cached)

      await Promise.all(
        providers.flatMap((provider) =>
          provider.moduleConfigs.map(async (moduleConfig) => {
            // Make sure module and all nested entities are scoped to the plugin
            moduleConfig.plugin = provider.name
            return this.addModuleConfig(moduleConfig)
          })
        )
      )

      for (const provider of providers) {
        this.resolvedProviders[provider.name] = provider
      }

      if (gotCachedResult) {
        providerLog.success("Cached")
        providerLog.info(chalk.gray("Run with --force-refresh to force a refresh of provider statuses."))
      } else {
        providerLog.success("Done")
      }

      providerLog.silly(`Resolved providers: ${providers.map((p) => p.name).join(", ")}`)
    })

    return keyBy(providers, "name")
  }

  @pMemoizeDecorator()
  async getTools() {
    if (!this.tools) {
      const plugins = await this.getAllPlugins()
      const tools: PluginTools = {}

      for (const plugin of Object.values(plugins)) {
        for (const tool of plugin.tools || []) {
          tools[`${plugin.name}.${tool.name}`] = new PluginTool(tool)
        }
      }

      this.tools = tools
    }
    return this.tools
  }

  /**
   * When running workflows via the `workflow` command, we only resolve the workflow being executed.
   */
  async getWorkflowConfig(name: string): Promise<WorkflowConfig> {
    return resolveWorkflowConfig(this, await this.getRawWorkflowConfig(name))
  }

  async getRawWorkflowConfig(name: string): Promise<WorkflowConfig> {
    return (await this.getRawWorkflowConfigs([name]))[0]
  }

  async getRawWorkflowConfigs(names?: string[]): Promise<WorkflowConfig[]> {
    if (!this.state.configsScanned) {
      await this.scanAndAddConfigs()
    }
    if (names) {
      return Object.values(pickKeys(this.workflowConfigs, names, "workflow"))
    } else {
      return Object.values(this.workflowConfigs)
    }
  }

  /**
   * Returns the reported status from all configured providers.
   */
  async getEnvironmentStatus(log: Log) {
    const providers = await this.resolveProviders(log)
    return mapValues(providers, (p) => p.status)
  }

  @pMemoizeDecorator()
  async getActionRouter() {
    const loadedPlugins = await this.getAllPlugins()
    const moduleTypes = await this.getModuleTypes()
    const plugins = keyBy(loadedPlugins, "name")

    // We only pass configured plugins to the router (others won't have the required configuration to call handlers)
    const configuredPlugins = this.getRawProviderConfigs().map((c) => plugins[c.name])

    return new ActionRouter(this, configuredPlugins, loadedPlugins, moduleTypes)
  }

  /**
   * Returns module configs that are registered in this context, before template resolution and validation.
   * Scans for modules in the project root and remote/linked sources if it hasn't already been done.
   */
  async getRawModuleConfigs(keys?: string[]): Promise<ModuleConfig[]> {
    if (!this.state.configsScanned) {
      await this.scanAndAddConfigs()
    }

    return Object.values(keys ? pickKeys(this.moduleConfigs, keys, "module config") : this.moduleConfigs)
  }

  /**
   * Returns action configs that are registered in this context, before template resolution and validation.
   * Scans for configs in the project root and remote/linked sources if it hasn't already been done.
   */
  async getRawActionConfigs() {
    if (!this.state.configsScanned) {
      await this.scanAndAddConfigs()
    }

    return this.actionConfigs
  }

  async getOutputConfigContext(log: Log, modules: GardenModule[], graphResults: GraphResults) {
    const providers = await this.resolveProviders(log)
    return new OutputConfigContext({
      garden: this,
      resolvedProviders: providers,
      variables: this.variables,
      modules,
      graphResults,
      partialRuntimeResolution: false,
    })
  }

  /**
   * Resolve the raw module and action configs and return a new instance of ConfigGraph.
   * The graph instance is immutable and represents the configuration at the point of calling this method.
   * For long-running processes, you need to call this again when any module or configuration has been updated.
   *
   * If `emit = true` is passed, a `stackGraph` event with a rendered DAG representation of the graph will be emitted.
   * When implementing a new command that calls this method and also streams events, make sure that the first
   * call to `getConfigGraph` in the command uses `emit = true` to ensure that the graph event gets streamed.
   */
  @OtelTraced({
    name: "getConfigGraph",
  })
  async getConfigGraph({ log, graphResults, emit, actionModes = {} }: GetConfigGraphParams): Promise<ConfigGraph> {
    // TODO: split this out of the Garden class
    await this.scanAndAddConfigs()

    const resolvedProviders = await this.resolveProviders(log)
    const rawModuleConfigs = await this.getRawModuleConfigs()

    const graphLog = log.createLog({ name: "graph", showDuration: true }).info(`Resolving actions and modules...`)

    // Resolve the project module configs
    const resolver = new ModuleResolver({
      garden: this,
      log: graphLog,
      rawConfigs: rawModuleConfigs,
      resolvedProviders,
      graphResults,
    })

    const resolvedModules = await resolver.resolveAll()

    // Validate the module dependency structure. This will throw on failure.
    const router = await this.getActionRouter()
    const moduleTypes = await this.getModuleTypes()
    const moduleGraph = new ModuleGraph(resolvedModules, moduleTypes)

    // Require include/exclude on modules if their paths overlap
    const overlaps = detectModuleOverlap({
      projectRoot: this.projectRoot,
      gardenDirPath: this.gardenDirPath,
      moduleConfigs: resolvedModules,
    })
    if (overlaps.length > 0) {
      const overlapErrors = makeOverlapErrors(this.projectRoot, overlaps)
      throw new ConfigurationError({
        message: overlapErrors.join("\n\n"),
      })
    }

    // Convert modules to actions
    const { groups: moduleGroups, actions: moduleActionConfigs } = await convertModules(
      this,
      graphLog,
      resolvedModules,
      moduleGraph
    )

    // Get action configs
    const actionConfigs: ActionConfigsByKey = {}

    for (const kind of actionKinds) {
      for (const name in this.actionConfigs[kind]) {
        const key = actionReferenceToString({ kind, name })
        actionConfigs[key] = this.actionConfigs[kind][name]
      }
    }

    for (const config of moduleActionConfigs) {
      const key = actionReferenceToString(config)
      const existing = actionConfigs[key]

      if (existing) {
        const moduleActionPath = config.internal.configFilePath || config.internal.basePath
        const actionPath = existing.internal.configFilePath || existing.internal.basePath
        throw new ConfigurationError({
          message: `${existing.kind} action '${existing.name}' (in ${actionPath}) conflicts with ${config.kind} action with same name generated from Module ${config.internal?.moduleName} (in ${moduleActionPath}). Please rename either one.`,
        })
      }

      actionConfigs[key] = config
    }

    // Resolve configs to Actions
    const linkedSources = keyBy(await getLinkedSources(this, "action"), "name")

    const graph = await actionConfigsToGraph({
      garden: this,
      configs: Object.values(actionConfigs),
      groupConfigs: moduleGroups,
      log: graphLog,
      moduleGraph,
      actionModes,
      linkedSources,
      environmentName: this.environmentName,
    })

    // TODO-0.13.1: detect overlap on Build actions

    // Walk through all plugins in dependency order, and allow them to augment the graph
    const plugins = keyBy(await this.getAllPlugins(), "name")

    for (const pluginName of getDependencyOrder(plugins)) {
      const provider = resolvedProviders[pluginName]

      if (!provider) {
        continue
      }

      // Skip the routine if the provider doesn't have the handler
      const handler = await router.provider.getPluginHandler({
        handlerType: "augmentGraph",
        pluginName,
        throwIfMissing: false,
      })

      if (!handler) {
        continue
      }

      const { addDependencies, addActions } = await router.provider.augmentGraph({
        pluginName,
        log: graphLog,
        providers: resolvedProviders,
        actions: graph.getActions(),
        events: undefined,
      })

      let updated = false

      // Resolve actions from augmentGraph specs and add to the list
      await Promise.all(
        (addActions || []).map(async (config) => {
          // There is no actual config file for plugin modules (which the prepare function assumes)
          delete config.internal?.configFilePath

          if (!config.internal.basePath) {
            config.internal.basePath = this.projectRoot
          }

          const key = actionReferenceToString(config)

          const action = await actionFromConfig({
            garden: this,
            graph,
            config,
            router,
            log: graphLog,
            configsByKey: actionConfigs,
            mode: actionModes[key] || "default",
            linkedSources,
            scanRoot: config.internal.basePath,
          })

          graph.addAction(action)
          actionConfigs[key] = config

          updated = true
        })
      )

      for (const dependency of addDependencies || []) {
        for (const key of ["by", "on"]) {
          try {
            graph.getActionByRef(dependency[key])
          } catch (err) {
            throw new PluginError({
              message: deline`
                Provider '${provider.name}' added a dependency by action '${actionReferenceToString(
                  dependency.by
                )}' on '${actionReferenceToString(dependency.on)}'
                but action '${actionReferenceToString(dependency[key])}' could not be found.
              `,
            })
          }
        }

        graph.addDependency(dependency.by, dependency.on, {
          explicit: true,
          needsStaticOutputs: false,
          needsExecutedOutputs: false,
        })
        updated = true
      }

      if (updated) {
        graph.validate()
      }
    }

    // Ensure dependency structure is alright
    graph.validate()

    if (emit) {
      // This is meant for consumption by Garden Cloud
      this.events.emit("stackGraph", graph.render())
    }

    // This event is internal only, not to be streamed
    this.events.emit("configGraph", { graph })

    graphLog.success(chalk.green("Done"))

    return graph.toConfigGraph()
  }

  async getResolvedConfigGraph(params: GetConfigGraphParams): Promise<ResolvedConfigGraph> {
    const graph = await this.getConfigGraph(params)
    const resolved = await this.resolveActions({ graph, actions: graph.getActions(), log: params.log })
    return new ResolvedConfigGraph({
      actions: Object.values(resolved),
      moduleGraph: graph.moduleGraph,
      // TODO: perhaps groups should be resolved here
      groups: graph.getGroups(),
    })
  }

  @OtelTraced({
    name: "resolveAction",
  })
  async resolveAction<T extends Action>({ action, graph, log }: { action: T; log: Log; graph: ConfigGraph }) {
    return resolveAction({ garden: this, action, graph, log })
  }

  @OtelTraced({
    name: "resolveActions",
  })
  async resolveActions<T extends Action>({ actions, graph, log }: { actions: T[]; log: Log; graph: ConfigGraph }) {
    return resolveActions({ garden: this, actions, graph, log })
  }

  @OtelTraced({
    name: "executeAction",
  })
  async executeAction<T extends Action>({ action, graph, log }: { action: T; log: Log; graph: ConfigGraph }) {
    return executeAction({ garden: this, action, graph, log })
  }

  /**
   * Resolves the module version (i.e. build version) for the given module configuration and its build dependencies.
   */
  async resolveModuleVersion({
    log,
    moduleConfig,
    moduleDependencies,
    force = false,
    scanRoot,
  }: {
    log: Log
    moduleConfig: ModuleConfig
    moduleDependencies: GardenModule[]
    force?: boolean
    scanRoot?: string
  }): Promise<ModuleVersion> {
    const moduleName = moduleConfig.name
    const depModuleNames = moduleDependencies.map((m) => m.name)
    depModuleNames.sort()
    const cacheKey = ["moduleVersions", moduleName, ...depModuleNames]

    if (!force) {
      const cached = <ModuleVersion>this.treeCache.get(log, cacheKey)

      if (cached) {
        return cached
      }
    }

    log.silly(`Resolving version for module ${moduleName}`)

    const cacheContexts = [...moduleDependencies, moduleConfig].map((c: ModuleConfig) => getModuleCacheContext(c))

    const treeVersion = await this.vcs.getTreeVersion({
      log,
      projectName: this.projectName,
      config: moduleConfig,
      scanRoot,
    })

    validateSchema(treeVersion, treeVersionSchema(), {
      context: `${this.vcs.name} tree version for module at ${moduleConfig.path}`,
    })

    const namedDependencyVersions = moduleDependencies.map((m) => ({ ...m.version, name: m.name }))

    const versionString = getModuleVersionString(
      moduleConfig,
      { ...treeVersion, name: moduleConfig.name },
      namedDependencyVersions
    )

    const version: ModuleVersion = {
      ...treeVersion,
      dependencyVersions: mapValues(keyBy(namedDependencyVersions, "name"), (v) => v.versionString),
      versionString,
    }

    this.treeCache.set(log, cacheKey, version, ...cacheContexts)
    return version
  }

  /**
   * Scans the specified directories for Garden config files and returns a list of paths.
   */
  @OtelTraced({
    name: "scanForConfigs",
  })
  async scanForConfigs(log: Log, path: string) {
    log.silly(`Scanning for configs in ${path}`)

    return findConfigPathsInPath({
      vcs: this.vcs,
      dir: path,
      include: this.moduleIncludePatterns,
      exclude: this.moduleExcludePatterns,
      log,
    })
  }

  /**
   * Scans the project root for modules and workflows and adds them to the context.
   */
  @OtelTraced({
    name: "scanAndAddConfigs",
  })
  async scanAndAddConfigs(force = false) {
    if (this.state.configsScanned && !force) {
      return
    }

    return this.asyncLock.acquire("scan-configs", async () => {
      if (this.state.configsScanned && !force) {
        return
      }

      this.log.silly(`Scanning for configs (force=${force})`)

      // Add external sources that are defined at the project level. External sources are either kept in
      // the .garden/sources dir (and cloned there if needed), or they're linked to a local path via the link command.
      const linkedSources = await getLinkedSources(this, "project")
      const projectSources = this.getProjectSources()
      const extSourcePaths = await Promise.all(
        projectSources.map(({ name, repositoryUrl }) => {
          return this.resolveExtSourcePath({
            name,
            linkedSources,
            repositoryUrl,
            sourceType: "project",
          })
        })
      )

      const dirsToScan = [this.projectRoot, ...extSourcePaths]
      const configPaths = flatten(await Promise.all(dirsToScan.map((path) => this.scanForConfigs(this.log, path))))
      for (const path of configPaths) {
        this.configPaths.add(path)
      }

      const allResources = flatten(
        await Promise.all(configPaths.map(async (path) => (await this.loadResources(path)) || []))
      )
      const groupedResources = groupBy(allResources, "kind")

      for (const [kind, configs] of Object.entries(groupedResources)) {
        throwOnMissingSecretKeys(configs, this.secrets, kind, this.log)
      }

      let rawModuleConfigs = [...((groupedResources.Module as ModuleConfig[]) || [])]
      const rawWorkflowConfigs = (groupedResources.Workflow as WorkflowConfig[]) || []
      const rawConfigTemplateResources = (groupedResources[configTemplateKind] as ConfigTemplateResource[]) || []

      // Resolve config templates
      const configTemplates = await Promise.all(rawConfigTemplateResources.map((r) => resolveConfigTemplate(this, r)))
      const templatesByName = keyBy(configTemplates, "name")
      // -> detect duplicate templates
      const duplicateTemplates = duplicatesByKey(configTemplates, "name")

      if (duplicateTemplates.length > 0) {
        const messages = duplicateTemplates
          .map(
            (d) =>
              `Name ${d.value} is used at ${naturalList(
                d.duplicateItems.map((i) =>
                  relative(this.projectRoot, i.internal.configFilePath || i.internal.basePath)
                )
              )}`
          )
          .join("\n")
        throw new ConfigurationError({
          message: `Found duplicate names of ${configTemplateKind}s:\n${messages}`,
        })
      }

      // Convert type:templated modules to Render configs
      // TODO: remove in 0.14
      const rawTemplatedModules = rawModuleConfigs.filter((m) => m.type === "templated") as TemplatedModuleConfig[]
      // -> removed templated modules from the module config list
      rawModuleConfigs = rawModuleConfigs.filter((m) => m.type !== "templated")

      const renderConfigs = [
        ...(groupedResources[renderTemplateKind] || []),
        ...rawTemplatedModules.map(convertTemplatedModuleToRender),
      ] as RenderTemplateConfig[]

      // Resolve Render configs
      const renderResults = await Promise.all(
        renderConfigs.map((config) =>
          renderConfigTemplate({ garden: this, log: this.log, config, templates: templatesByName })
        )
      )

      const actionsFromTemplates = renderResults.flatMap((r) => r.configs.filter(isActionConfig))
      const modulesFromTemplates = renderResults.flatMap((r) => r.modules)
      const workflowsFromTemplates = renderResults.flatMap((r) => r.configs.filter(isWorkflowConfig))

      if (renderConfigs.length) {
        this.log.silly(
          `Rendered ${actionsFromTemplates.length} actions, ${modulesFromTemplates.length} modules, and ${workflowsFromTemplates.length} workflows from templates`
        )
      }

      rawModuleConfigs.push(...modulesFromTemplates)
      rawWorkflowConfigs.push(...workflowsFromTemplates)

      // Add all the configs
      rawModuleConfigs.map((c) => this.addModuleConfig(c))
      rawWorkflowConfigs.map((c) => this.addWorkflow(c))

      let actionsCount = 0

      for (const kind of actionKinds) {
        const actionConfigs = groupedResources[kind] || []

        // Verify that the project apiVersion is defined as compatible with action kinds
        // This is only available with apiVersion `garden.io/v1` or newer.
        if (actionConfigs.length && this.projectApiVersion !== GardenApiVersion.v1) {
          throw new ConfigurationError({
            message: `Action kinds are only supported in project configurations with "apiVersion: ${GardenApiVersion.v1}". A detailed migration guide is available at ${DOCS_BASE_URL}/guides/migrating-to-bonsai`,
          })
        }

        for (const config of actionConfigs) {
          this.addActionConfig(config as unknown as BaseActionConfig)
          actionsCount++
        }
      }

      for (const config of actionsFromTemplates) {
        this.addActionConfig(config)
      }

      this.log.debug(
        `Scanned and found ${actionsCount} actions, ${rawWorkflowConfigs.length} workflows and ${rawModuleConfigs.length} modules`
      )

      this.state.configsScanned = true
      this.configTemplates = { ...this.configTemplates, ...keyBy(configTemplates, "name") }

      this.events.emit("configsScanned", {})
    })
  }

  /**
   * Add an action config to the context, after validating and calling the appropriate configure plugin handler.
   */
  protected addActionConfig(config: BaseActionConfig) {
    this.log.silly(`Adding ${config.kind} action ${config.name}`)
    const key = actionReferenceToString(config)
    const existing = this.actionConfigs[config.kind][config.name]

    if (existing) {
      if (actionIsDisabled(config, this.environmentName)) {
        this.log.silly(`Skipping action ${key} because it is disabled and another action with the same key exists`)
        return
      } else if (!actionIsDisabled(existing, this.environmentName)) {
        const paths = [
          existing.internal.configFilePath || existing.internal.basePath,
          config.internal.configFilePath || config.internal.basePath,
        ]
        const [pathA, pathB] = paths.map((path) => relative(this.projectRoot, path)).sort()

        throw new ConfigurationError({
          message: `${config.kind} action ${config.name} is declared multiple times (in '${pathA}' and '${pathB}') and neither is disabled.`,
        })
      }
    }

    this.actionConfigs[config.kind][config.name] = config
  }

  /**
   * Add a module config to the context, after validating and calling the appropriate configure plugin handler.
   */
  private addModuleConfig(config: ModuleConfig) {
    const key = config.name
    this.log.silly(`Adding module ${key}`)
    const existing = this.moduleConfigs[key]

    if (existing) {
      const paths = [existing.configPath || existing.path, config.configPath || config.path]
      const [pathA, pathB] = paths.map((path) => relative(this.projectRoot, path)).sort()

      throw new ConfigurationError({
        message: `Module ${key} is declared multiple times (in '${pathA}' and '${pathB}')`,
      })
    }

    this.moduleConfigs[key] = config
  }

  /**
   * Add a workflow config to the context after validating that its name doesn't conflict with previously
   * added workflows, and partially resolving it (i.e. without fully resolving step configs, which
   * is done just-in-time before a given step is run).
   */
  private addWorkflow(config: WorkflowConfig) {
    const key = config.name
    this.log.silly(`Adding workflow ${key}`)

    const existing = this.workflowConfigs[key]

    if (existing) {
      const paths = [existing.internal.configFilePath || existing.internal.basePath, config.internal.basePath]
      const [pathA, pathB] = paths.map((path) => relative(this.projectRoot, path)).sort()

      throw new ConfigurationError({
        message: `Workflow ${key} is declared multiple times (in '${pathA}' and '${pathB}')`,
      })
    }

    this.workflowConfigs[key] = config
  }

  /**
   * Load any non-Project resources from the specified config file path.
   *
   * @param configPath Path to a garden config file
   */
  @OtelTraced({
    name: "loadResources",
  })
  private async loadResources(configPath: string): Promise<(GardenResource | ModuleConfig)[]> {
    configPath = resolve(this.projectRoot, configPath)
    this.log.silly(`Load configs from ${configPath}`)
    const resources = await loadConfigResources(this.log, this.projectRoot, configPath)
    this.log.silly(`Loaded configs from ${configPath}`)
    return resources.filter((r) => r.kind && r.kind !== "Project")
  }

  //===========================================================================
  //region Internal helpers
  //===========================================================================

  /**
   * Returns the configured project sources, and resolves any template strings on them.
   */
  public getProjectSources() {
    const context = new RemoteSourceConfigContext(this, this.variables)
    const source = { yamlDoc: this.projectConfig.internal.yamlDoc, basePath: ["sources"] }
    const resolved = validateSchema(
      resolveTemplateStrings({ value: this.projectSources, context, source }),
      projectSourcesSchema(),
      {
        context: "remote source",
        source,
      }
    )
    return resolved
  }

  /**
   * Clones the project/module source if needed and returns the path (either from .garden/sources or from a local path)
   */
  public async resolveExtSourcePath({
    name,
    linkedSources,
    repositoryUrl,
    sourceType,
  }: {
    name: string
    linkedSources: LinkedSource[]
    repositoryUrl: string
    sourceType: ExternalSourceType
  }): Promise<string> {
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

  public getEnvironmentConfig() {
    for (const config of this.projectConfig.environments) {
      if (config.name === this.environmentName) {
        return config
      }
    }

    throw new InternalError({
      message: `Could not find environment config ${this.environmentName}. Available environments: ${naturalList(
        this.projectConfig.environments.map((e) => e.name)
      )}`,
    })
  }

  public getInstanceKey() {
    return getGardenInstanceKey(this.getInstanceKeyParams())
  }

  public getInstanceKeyParams() {
    let namespace: string | undefined

    // This is either the default namespace defined in the Project config for the current environment or, as a fall back,
    // the hard coded "default" value.
    const defaultNs = this.resolvedDefaultNamespace || defaultNamespace

    // this.namespace is the actual namespace for this Garden instance, and is either set
    // via the `--env` flag or defined in the Project config.
    if (this.namespace !== defaultNs) {
      namespace = this.namespace
    }

    return {
      environmentName: this.environmentName,
      namespace,
      projectRoot: this.projectRoot,
      variableOverrides: this.opts.variableOverrides || {},
    }
  }

  /**
   * This dumps the full project configuration including all modules.
   * Set includeDisabled=true to include disabled modules, services, tasks and tests.
   * Set partial=true to avoid resolving providers. If set, includeDisabled is implicitly true.
   */
  public async dumpConfig({
    log,
    graph,
    includeDisabled = false,
    resolveGraph = true,
    resolveProviders = true,
    resolveWorkflows = true,
  }: {
    log: Log
    graph?: ConfigGraph
    includeDisabled?: boolean
    resolveGraph?: boolean
    resolveProviders?: boolean
    resolveWorkflows?: boolean
  }): Promise<ConfigDump> {
    let providers: ConfigDump["providers"] = []
    let moduleConfigs: ModuleConfig[]
    let workflowConfigs: WorkflowConfig[]
    let actionConfigs: ActionConfigMap = {
      Build: {},
      Deploy: {},
      Run: {},
      Test: {},
    }

    await this.scanAndAddConfigs()

    if (resolveProviders) {
      providers = Object.values(await this.resolveProviders(log))
    } else {
      providers = this.getRawProviderConfigs()
    }

    if (!graph && resolveGraph) {
      graph = await this.getResolvedConfigGraph({ log, emit: false })
    }

    if (graph) {
      for (const action of graph.getActions()) {
        actionConfigs[action.kind][action.name] = action.getConfig()
      }
      const modules = graph.getModules({ includeDisabled })
      moduleConfigs = sortBy(
        modules.map((m) => m._config),
        "name"
      )
      workflowConfigs = (await this.getRawWorkflowConfigs()).map((config) => resolveWorkflowConfig(this, config))
    } else {
      providers = this.getRawProviderConfigs()
      moduleConfigs = await this.getRawModuleConfigs()
      workflowConfigs = await this.getRawWorkflowConfigs()
      actionConfigs = this.actionConfigs
    }

    const allEnvironmentNames = this.projectConfig.environments.map((c) => c.name)

    return {
      environmentName: this.environmentName,
      allEnvironmentNames,
      namespace: this.namespace,
      providers,
      variables: this.variables,
      actionConfigs,
      moduleConfigs,
      workflowConfigs: sortBy(workflowConfigs, "name"),
      projectName: this.projectName,
      projectRoot: this.projectRoot,
      projectId: this.projectId,
      domain: this.cloudDomain,
      sources: this.projectSources,
      suggestedCommands: await this.getSuggestedCommands(),
    }
  }

  public async getSuggestedCommands(): Promise<SuggestedCommand[]> {
    const suggestions: SuggestedCommand[] = [
      {
        name: "deploy",
        description: "Deploy the whole project",
        gardenCommand: "deploy",
      },
    ]

    // TODO: call plugin handlers to get plugin-specific suggestions

    return suggestions
  }

  /** Returns whether the user is logged in to the Garden Cloud */
  public isLoggedIn(): boolean {
    return !!this.cloudApi
  }
}

/**
 * This is split out of the below function for use by GardenServer, in order to resolve just enough to pick a Garden
 * instance based on request inputs.
 */
export async function resolveGardenParamsPartial(currentDirectory: string, opts: GardenOpts) {
  let { environmentString: environmentStr, config, gardenDirPath } = opts
  const log = (opts.log || getRootLogger()).createLog()

  if (!config) {
    config = await findProjectConfig({ log, path: currentDirectory })

    if (!config) {
      throw new ConfigurationError({
        message: `Not a project directory (or any of the parent directories): ${currentDirectory}`,
      })
    }
  }

  gardenDirPath = resolve(config.path, gardenDirPath || DEFAULT_GARDEN_DIR_NAME)
  const artifactsPath = resolve(gardenDirPath, "artifacts")

  const _username = (await username()) || ""
  const projectName = config.name
  const { path: projectRoot } = config
  const commandInfo = opts.commandInfo

  const treeCache = new TreeCache()

  // Note: another VcsHandler is created later, this one is temporary
  const gitHandler = new GitHandler({
    projectRoot,
    gardenDirPath,
    ignoreFile: defaultConfigFilename,
    cache: treeCache,
  })
  const vcsInfo = await gitHandler.getPathInfo(log, projectRoot)

  // Since we iterate/traverse them before fully validating them (which we do after resolving template strings), we
  // validate that `config.environments` and `config.providers` are both arrays.
  // This prevents cryptic type errors when the user mistakenly writes down e.g. a map instead of an array.
  validateWithPath({
    config: config.environments,
    schema: joi.array().items(joi.object()).min(1).required(),
    configType: "project environments",
    path: config.path,
    projectRoot: config.path,
    source: { yamlDoc: config.internal.yamlDoc, basePath: ["environments"] },
  })

  const configDefaultEnvironment = resolveTemplateString({
    string: config.defaultEnvironment || "",
    context: new DefaultEnvironmentContext({
      projectName,
      projectRoot,
      artifactsPath,
      vcsInfo,
      username: _username,
      commandInfo,
    }),
  }) as string

  const localConfigStore = new LocalConfigStore(gardenDirPath)

  if (!environmentStr) {
    const localConfigDefaultEnv = await localConfigStore.get("defaultEnv")

    if (localConfigDefaultEnv) {
      log.info(`Using environment ${localConfigDefaultEnv}, set with the \`set default-env\` command`)
    }

    environmentStr = getDefaultEnvironmentName(localConfigDefaultEnv || configDefaultEnvironment, config)
  }

  const { environment: environmentName, namespace } = parseEnvironment(environmentStr)

  return {
    artifactsPath,
    commandInfo,
    config,
    configDefaultEnvironment,
    environmentName,
    environmentStr,
    gardenDirPath,
    localConfigStore,
    log,
    namespace,
    projectName,
    projectRoot,
    treeCache,
    username: _username,
    vcsInfo,
  }
}

export const resolveGardenParams = profileAsync(async function _resolveGardenParams(
  currentDirectory: string,
  opts: GardenOpts
): Promise<GardenParams> {
  return wrapActiveSpan("resolveGardenParams", async () => {
    const partialResolved = await resolveGardenParamsPartial(currentDirectory, opts)

    const {
      artifactsPath,
      commandInfo,
      configDefaultEnvironment,
      environmentName,
      environmentStr,
      gardenDirPath,
      localConfigStore,
      log,
      projectName,
      projectRoot,
      treeCache,
      username: _username,
      vcsInfo,
    } = partialResolved

    let { config, namespace } = partialResolved

    await ensureDir(gardenDirPath)
    await ensureDir(artifactsPath)

    const projectApiVersion = config.apiVersion
    const sessionId = opts.sessionId || uuidv4()
    const cloudApi = opts.cloudApi || null

    let secrets: StringMap = {}
    let cloudProject: CloudProject | null = null
    // If true, then user is logged in and we fetch the remote project and secrets (if applicable)
    if (!opts.noEnterprise && cloudApi) {
      const distroName = getCloudDistributionName(cloudApi.domain)
      const useCommunityDashboard = !config.domain
      const cloudLog = log.createLog({ name: getCloudLogSectionName(distroName) })

      cloudLog.verbose(`Connecting to ${distroName}...`)

      cloudProject = await getCloudProject({
        cloudApi,
        config,
        log: cloudLog,
        projectName,
        projectRoot,
        useCommunityDashboard,
      })

      // Fetch Secrets. Not supported on the community edition.
      if (cloudProject && !useCommunityDashboard) {
        try {
          secrets = await wrapActiveSpan(
            "getSecrets",
            async () =>
              await cloudApi.getSecrets({
                log: cloudLog,
                projectId: cloudProject!.id,
                environmentName,
              })
          )
          cloudLog.debug(`Fetched ${Object.keys(secrets).length} secrets from ${cloudApi.domain}`)
        } catch (err) {
          cloudLog.error(`Fetching secrets failed with error: ${err}`)
        }
      }

      cloudLog.success("Ready")
    }

    const loggedIn = !!cloudApi

    config = resolveProjectConfig({
      log,
      defaultEnvironmentName: configDefaultEnvironment,
      config,
      artifactsPath,
      vcsInfo,
      username: _username,
      loggedIn,
      enterpriseDomain: config.domain,
      secrets,
      commandInfo,
    })

    const pickedEnv = await pickEnvironment({
      projectConfig: config,
      envString: environmentStr,
      artifactsPath,
      vcsInfo,
      username: _username,
      loggedIn,
      enterpriseDomain: config.domain,
      secrets,
      commandInfo,
    })

    const { providers, production } = pickedEnv
    let { variables } = pickedEnv

    // Allow overriding variables
    const variableOverrides = opts.variableOverrides || {}
    variables = overrideVariables(variables, variableOverrides)

    // Update the log context
    log.context.gardenKey = getGardenInstanceKey({ environmentName, namespace, projectRoot, variableOverrides })
    log.context.sessionId = sessionId

    // Setting this after resolving the gardenKey above because we don't want the default namespace resolved there
    namespace = pickedEnv.namespace

    const workingCopyId = await getWorkingCopyId(gardenDirPath)

    // We always exclude the garden dir
    const gardenDirExcludePattern = `${relative(projectRoot, gardenDirPath)}/**/*`

    const moduleExcludePatterns = [
      ...((config.scan || {}).exclude || []),
      gardenDirExcludePattern,
      ...fixedProjectExcludes,
    ]

    // Set proxy hostname with the following order of precedence: env var > config > default value ("localhost")
    let proxyHostname: string
    if (gardenEnv.GARDEN_PROXY_DEFAULT_ADDRESS) {
      proxyHostname = gardenEnv.GARDEN_PROXY_DEFAULT_ADDRESS
    } else if (config.proxy?.hostname) {
      proxyHostname = config.proxy.hostname
    } else {
      proxyHostname = defaultLocalAddress
    }
    const proxy = {
      hostname: proxyHostname,
    }

    // If the user is logged in and a cloud project exists we use that ID
    // but fallback to the one set in the config since that's e.g. unsed in analytics.
    // The same applies for domains.
    const projectId = cloudProject?.id || config.id
    const cloudDomain = cloudApi?.domain || config.domain || DEFAULT_GARDEN_CLOUD_DOMAIN

    return {
      artifactsPath,
      vcsInfo,
      sessionId,
      projectId,
      cloudDomain,
      projectConfig: config,
      projectRoot,
      projectName,
      environmentName,
      resolvedDefaultNamespace: pickedEnv.defaultNamespace,
      namespace,
      variables,
      variableOverrides,
      secrets,
      projectSources: config.sources,
      production,
      gardenDirPath,
      globalConfigStore: opts.globalConfigStore,
      localConfigStore,
      opts,
      outputs: config.outputs || [],
      plugins: opts.plugins || [],
      providerConfigs: providers,
      moduleExcludePatterns,
      workingCopyId,
      dotIgnoreFile: config.dotIgnoreFile,
      proxy,
      log,
      moduleIncludePatterns: (config.scan || {}).include,
      username: _username,
      forceRefresh: opts.forceRefresh,
      cloudApi,
      cache: treeCache,
      projectApiVersion,
    }
  })
})

/**
 * Returns the cloud project for the respective cloud edition (i.e. community or commercial).
 */
async function getCloudProject({
  cloudApi,
  config,
  log,
  useCommunityDashboard,
  projectRoot,
  projectName,
}: {
  cloudApi: CloudApi
  config: ProjectConfig
  log: Log
  useCommunityDashboard: boolean
  projectRoot: string
  projectName: string
}) {
  const distroName = getCloudDistributionName(cloudApi.domain)
  const projectIdFromConfig = config.id

  // If logged into community edition, throw if ID is set
  if (projectIdFromConfig && useCommunityDashboard) {
    const msg = wordWrap(
      deline`
        Invalid field 'id' found in project configuration at path ${projectRoot}. The 'id'
        field should only be set if using a commerical edition of Garden. Please remove to continue
        using the Garden community edition.
      `,
      120
    )
    throw new ConfigurationError({ message: msg })
  }

  // If logged into community edition, return project or throw if it can't be fetched/created
  if (useCommunityDashboard) {
    log.debug(`Fetching or creating project ${projectName} from ${cloudApi.domain}`)
    try {
      const cloudProject = await cloudApi.getOrCreateProjectByName(projectName)
      return cloudProject
    } catch (err) {
      log.error(`Fetching or creating project ${projectName} from ${cloudApi.domain} failed with error: ${err}`)
      throw err
    }
  }

  // If logged into commercial edition and ID is not set, log warning and return null
  if (!projectIdFromConfig) {
    log.warn(
      chalk.yellow(
        wordWrap(
          deline`
            Logged in to ${cloudApi.domain}, but could not find remote project '${projectName}'.
            Command results for this command run will not be available in ${distroName}.
          `,
          120
        )
      )
    )

    return null
  }

  // If logged into commercial edition, return project or throw if unable to fetch by ID
  log.debug(`Fetching project ${projectIdFromConfig} from ${cloudApi.domain}.`)
  try {
    const cloudProject = await cloudApi.getProjectById(projectIdFromConfig)
    return cloudProject
  } catch (err) {
    log.error(`Fetching project with ID=${projectIdFromConfig} failed with error: ${err}`)
    throw err
  }
}

// Override variables, also allows to override nested variables using dot notation
// eslint-disable-next-line @typescript-eslint/no-shadow
export function overrideVariables(variables: DeepPrimitiveMap, overrideVariables: DeepPrimitiveMap): DeepPrimitiveMap {
  const objNew = cloneDeep(variables)
  Object.keys(overrideVariables).forEach((key) => {
    if (objNew.hasOwnProperty(key)) {
      // if the original key itself is a string with a dot, then override that
      objNew[key] = overrideVariables[key]
    } else {
      set(objNew, key, overrideVariables[key])
    }
  })
  return objNew
}

/**
 * Dummy Garden class that doesn't scan for modules nor resolves providers.
 * Used by commands that have noProject=true. That is, commands that need
 * to run outside of valid Garden projects.
 */
export class DummyGarden extends Garden {
  override async resolveProviders() {
    return {}
  }

  override async scanAndAddConfigs() {}

  override async getRepoRoot() {
    return ""
  }
}

export async function makeDummyGarden(root: string, gardenOpts: GardenOpts) {
  if (!gardenOpts.environmentString) {
    gardenOpts.environmentString = `${defaultEnvironment}.${defaultNamespace}`
  }

  const parsed = parseEnvironment(gardenOpts.environmentString)
  const environmentName = parsed.environment || defaultEnvironment
  const _defaultNamespace = parsed.namespace || defaultNamespace

  const config: ProjectConfig = {
    path: root,
    apiVersion: GardenApiVersion.v1,
    kind: "Project",
    name: "no-project",
    internal: {
      basePath: root,
    },
    defaultEnvironment: "",
    dotIgnoreFile: defaultDotIgnoreFile,
    environments: [{ name: environmentName, defaultNamespace: _defaultNamespace, variables: {} }],
    providers: [],
    variables: {},
  }
  gardenOpts.config = config

  return DummyGarden.factory(root, { noEnterprise: true, ...gardenOpts })
}

export interface ConfigDump {
  environmentName: string // TODO: Remove this?
  allEnvironmentNames: string[]
  namespace: string
  providers: (Provider | GenericProviderConfig)[]
  variables: DeepPrimitiveMap
  actionConfigs: ActionConfigMap
  moduleConfigs: ModuleConfig[]
  workflowConfigs: WorkflowConfig[]
  projectName: string
  projectRoot: string
  projectId?: string
  domain?: string
  sources: SourceConfig[]
  suggestedCommands: SuggestedCommand[]
}

export interface GetConfigGraphParams {
  log: Log
  graphResults?: GraphResults
  emit: boolean
  actionModes?: ActionModeMap
}
