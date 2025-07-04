/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommonTaskParams, ResolveProcessDependenciesParams, TaskProcessParams } from "./base.js"
import { BaseTask } from "./base.js"
import type { BaseProviderConfig, Provider, ProviderMap } from "../config/provider.js"
import { providerFromConfig, getProviderTemplateReferences } from "../config/provider.js"
import { ConfigurationError, PluginError } from "../exceptions.js"
import { keyBy, omit, flatten, uniq } from "lodash-es"
import { ProviderConfigContext } from "../config/template-contexts/provider.js"
import type { ModuleConfig } from "../config/module.js"
import type { GardenPluginSpec } from "../plugin/plugin.js"
import { joi } from "../config/common.js"
import { validateWithPath, validateSchema } from "../config/validation.js"
import type { EnvironmentStatus } from "../plugin/handlers/Provider/getEnvironmentStatus.js"
import { defaultEnvironmentStatus } from "../plugin/handlers/Provider/getEnvironmentStatus.js"
import { getPluginBases, getPluginBaseNames } from "../plugins.js"
import { Profile } from "../util/profiling.js"
import { join, dirname } from "path"
import { deserialize, serialize } from "v8"
import { environmentStatusSchema } from "../config/status.js"
import { hashString, isNotNull, runScript } from "../util/util.js"
import { CACHE_DIR_NAME, gardenEnv } from "../constants.js"
import { stableStringify } from "../util/string.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"
import { LogLevel } from "../logger/logger.js"
import type { Log } from "../logger/log-entry.js"
import fsExtra from "fs-extra"
import { RemoteSourceConfigContext } from "../config/template-contexts/project.js"
import { deepEvaluate } from "../template/evaluate.js"
import type { UnresolvedProviderConfig } from "../config/project.js"

const { readFile, writeFile, ensureDir } = fsExtra

/**
 * Returns a provider log context with the provider name set.
 *
 * Also sets the log level to verbose for some built in providers that aren't really
 * resolved per se. A bit hacky but this is just a cosmetic change.
 */
function getProviderLog(providerName: string, log: Log) {
  const debugLogProviders = ["templated", "container"]
  const fixLevel = debugLogProviders.includes(providerName) ? LogLevel.debug : undefined
  return log.createLog({ name: providerName, fixLevel })
}

interface Params extends CommonTaskParams {
  plugin: GardenPluginSpec
  allPlugins: GardenPluginSpec[]
  config: UnresolvedProviderConfig
  forceRefresh: boolean
  forceInit: boolean
}

interface CachedStatus extends EnvironmentStatus {
  configHash: string
  resolvedAt: Date
}

const cachedStatusSchema = environmentStatusSchema().keys({
  configHash: joi.string().required(),
  resolvedAt: joi.date().required(),
})

const defaultCacheTtl = 3600 // 1 hour

/**
 * Resolves the configuration for the specified provider.
 */
@Profile()
export class ResolveProviderTask extends BaseTask<Provider> {
  readonly type = "resolve-provider"
  override readonly statusConcurrencyLimit = 20
  override readonly executeConcurrencyLimit = 20

  private config: UnresolvedProviderConfig
  private plugin: GardenPluginSpec
  private forceRefresh: boolean
  private forceInit: boolean
  private allPlugins: GardenPluginSpec[]

  constructor(params: Params) {
    super(params)
    this.config = params.config
    this.plugin = params.plugin
    this.allPlugins = params.allPlugins
    this.forceRefresh = params.forceRefresh
    this.forceInit = params.forceInit
  }

  getName() {
    return this.config.name
  }

  getDescription() {
    return `resolve provider ${this.getName()}`
  }

  getInputVersion() {
    return this.garden.version
  }

  resolveStatusDependencies() {
    return []
  }

  resolveProcessDependencies({ status }: ResolveProcessDependenciesParams<Provider>) {
    if (status?.state === "ready" && !this.force) {
      return []
    }

    const pluginDeps = this.plugin.dependencies
    const explicitDeps = (this.config.dependencies || []).map((name) => ({ name }))
    const implicitDeps = getProviderTemplateReferences(
      this.config,
      new RemoteSourceConfigContext(this.garden, this.garden.variables)
    ).map((name) => ({ name }))
    const allDeps = uniq([...pluginDeps, ...explicitDeps, ...implicitDeps])

    const rawProviderConfigs = this.garden.getUnresolvedProviderConfigs()
    const plugins = keyBy(this.allPlugins, "name")

    const matchDependencies = (depName: string) => {
      // Match against a provider if its name matches directly, or it inherits from a base named `depName`
      return rawProviderConfigs.filter(
        (c) => c.name === depName || getPluginBaseNames(c.name, plugins).includes(depName)
      )
    }

    // Make sure explicit dependencies are configured
    pluginDeps.map((dep) => {
      const matched = matchDependencies(dep.name)

      if (matched.length === 0 && !dep.optional) {
        throw new ConfigurationError({
          message:
            `Provider '${this.config.name}' depends on provider '${dep.name}', which is not configured. ` +
            `You need to add '${dep.name}' to your project configuration for the '${this.config.name}' to work.`,
        })
      }
    })

    return flatten(
      allDeps.map((dep) => {
        return matchDependencies(dep.name).map((config) => {
          const plugin = plugins[config.name]

          return new ResolveProviderTask({
            garden: this.garden,
            plugin,
            allPlugins: this.allPlugins,
            config,
            log: this.log,
            force: this.force,
            forceRefresh: this.forceRefresh,
            forceInit: this.forceInit,
          })
        })
      })
    )
  }

  async getStatus() {
    return null
  }

  @OtelTraced({
    name(_params) {
      return this.config.name + ".resolveProvider"
    },
    getAttributes(_spec) {
      return {
        name: this.config.name,
      }
    },
  })
  async process({ dependencyResults, statusOnly }: TaskProcessParams) {
    const providerResults = dependencyResults.getResultsByType(this).filter(isNotNull)
    const resolvedProviders: ProviderMap = keyBy(providerResults.map((r) => r.result).filter(isNotNull), "name")

    // Return immediately if the provider has been previously resolved
    const alreadyResolvedProviders = this.garden["resolvedProviders"][this.config.name]
    if (alreadyResolvedProviders) {
      return alreadyResolvedProviders
    }

    const context = new ProviderConfigContext(this.garden, resolvedProviders, this.garden.variables)

    this.log.silly(() => `Resolving template strings for provider ${this.config.name}`)

    const evaluatedConfig = deepEvaluate(this.config.unresolvedConfig, { context, opts: {} })
    const providerName = this.config.name
    const providerLog = getProviderLog(providerName, this.log)
    providerLog.info("Configuring provider...")

    this.log.silly(() => `Validating ${providerName} config`)

    const validateConfig = (config: unknown) => {
      return validateWithPath<BaseProviderConfig>({
        config,
        schema: this.plugin.configSchema || joi.object(),
        path: this.garden.projectRoot,
        projectRoot: this.garden.projectRoot,
        configType: "provider configuration",
        ErrorClass: ConfigurationError,
        source: undefined,
      })
    }

    let resolvedConfig = validateConfig(evaluatedConfig)

    let moduleConfigs: ModuleConfig[] = []

    this.log.silly(() => `Calling configureProvider on ${providerName}`)

    const actions = await this.garden.getActionRouter()

    // Validating the output config against the base plugins. This is important to make sure base handlers are
    // compatible with the config.
    const plugins = this.allPlugins
    const pluginsByName = keyBy(plugins, "name")
    const plugin = pluginsByName[providerName]

    const configureOutput = await actions.provider.configureProvider({
      ctx: await this.garden.getPluginContext({
        provider: providerFromConfig({
          plugin,
          config: resolvedConfig,
          dependencies: {},
          moduleConfigs: [],
          status: { ready: false, outputs: {} },
        }),
        templateContext: undefined,
        events: undefined,
      }),
      environmentName: this.garden.environmentName,
      namespace: this.garden.namespace,
      pluginName: providerName,
      log: providerLog,
      config: resolvedConfig,
      configStore: this.garden.localConfigStore,
      projectName: this.garden.projectName,
      projectRoot: this.garden.projectRoot,
      dependencies: resolvedProviders,
    })

    this.log.silly(() => `Validating ${providerName} config returned from configureProvider handler`)
    resolvedConfig = validateConfig(configureOutput.config)
    resolvedConfig.path = this.garden.projectRoot

    if (configureOutput.moduleConfigs) {
      moduleConfigs = configureOutput.moduleConfigs
    }

    // Validating the output config against the base plugins. This is important to make sure base handlers are
    // compatible with the config.
    const bases = getPluginBases(this.plugin, pluginsByName)

    for (const base of bases) {
      if (!base.configSchema) {
        continue
      }

      this.log.silly(() => `Validating '${providerName}' config against '${base.name}' schema`)

      resolvedConfig = validateWithPath<BaseProviderConfig>({
        config: resolvedConfig,
        schema: base.configSchema.unknown(true),
        path: this.garden.projectRoot,
        projectRoot: this.garden.projectRoot,
        configType: `provider configuration (base schema from '${base.name}' plugin)`,
        ErrorClass: ConfigurationError,
        source: undefined,
      })
    }

    this.log.silly(() => `Ensuring ${providerName} provider is ready`)
    providerLog.success("Provider configured")

    const tmpProvider = providerFromConfig({
      plugin: this.plugin,
      config: resolvedConfig,
      dependencies: resolvedProviders,
      moduleConfigs,
      status: defaultEnvironmentStatus,
    })

    const status = await this.ensurePrepared(tmpProvider, statusOnly)

    return providerFromConfig({
      plugin: this.plugin,
      config: resolvedConfig,
      dependencies: resolvedProviders,
      moduleConfigs,
      status,
    })
  }

  private getCachePath() {
    return getProviderStatusCachePath({
      gardenDirPath: this.garden.gardenDirPath,
      pluginName: this.plugin.name,
    })
  }

  private hashConfig(config: BaseProviderConfig) {
    return hashString(stableStringify(config))
  }

  private async getCachedStatus(config: BaseProviderConfig): Promise<EnvironmentStatus | null> {
    const cachePath = this.getCachePath()

    this.log.silly(() => `Checking provider status cache for ${this.plugin.name} at ${cachePath}`)

    let cachedStatus: CachedStatus | null = null

    if (!this.forceRefresh) {
      try {
        const cachedData = deserialize(await readFile(cachePath))
        cachedStatus = validateSchema(cachedData, cachedStatusSchema)
      } catch (err) {
        // Can't find or read a cached status
        this.log.silly(() => `Unable to find or read provider status from ${cachePath}: ${err}`)
      }
    }

    if (!cachedStatus) {
      return null
    }

    const configHash = this.hashConfig(config)

    if (cachedStatus.configHash !== configHash) {
      this.log.silly(() => `Cached provider status at ${cachePath} does not match the current config`)
      return null
    }

    const ttl = gardenEnv.GARDEN_CACHE_TTL || defaultCacheTtl
    const cacheAge = (new Date().getTime() - cachedStatus?.resolvedAt.getTime()) / 1000

    if (cacheAge > ttl) {
      this.log.silly(() => `Cached provider status at ${cachePath} is out of date`)
      return null
    }

    return omit(cachedStatus, ["configHash", "resolvedAt"])
  }

  private async setCachedStatus(config: BaseProviderConfig, status: EnvironmentStatus) {
    const cachePath = this.getCachePath()
    this.log.silly(() => `Caching provider status for ${this.plugin.name} at ${cachePath}`)

    const cachedStatus: CachedStatus = {
      ...status,
      cached: true,
      resolvedAt: new Date(),
      configHash: this.hashConfig(config),
    }

    await ensureDir(dirname(cachePath))
    await writeFile(cachePath, serialize(cachedStatus))
  }

  private async ensurePrepared(tmpProvider: Provider, statusOnly: boolean) {
    const pluginName = tmpProvider.name
    const providerLog = getProviderLog(pluginName, this.log)
    const actions = await this.garden.getActionRouter()
    const ctx = await this.garden.getPluginContext({
      provider: tmpProvider,
      templateContext: undefined,
      events: undefined,
    })

    // Forward log events to the CLI.
    // Probably should be solved similarly to
    // https://github.com/garden-io/garden/blob/135ea041306f1d9093ae9d6547b1f862ca809f57/core/src/router/build.ts#L44C12-L44C12
    // to have things consistent
    // but currently the `getEnvironmentStatus` and `prepareEnvironment` handlers don't go through the router
    ctx.events.on("log", ({ msg, origin, level }) => {
      // stream logs to CLI
      ctx.log[level]({ msg, origin })
    })

    // Check for cached provider status
    const cachedStatus = await this.getCachedStatus(tmpProvider.config)

    if (cachedStatus) {
      providerLog.success(`Provider status cached`)
      return cachedStatus
    }

    if (tmpProvider.config.preInit?.runScript) {
      providerLog.info(`Running pre-init script`)
      await runScript({
        log: providerLog,
        cwd: this.garden.projectRoot,
        script: tmpProvider.config.preInit.runScript,
      })
      providerLog.info(`Pre-init script completed successfully`)
    }

    // TODO: Remove this condition in 0.14 since we no longer check provider statuses when
    // before preparing environments. Instead we should simply set provider statuses to `"unknown"` (or similar)
    // in commands like `garden get status` since returning actual provider statuses doesn't really serve any purpose.
    if (statusOnly) {
      // TODO: avoid calling the handler manually (currently doing it to override the plugin context)
      const getStatusHandler = await actions.provider["getPluginHandler"]({
        handlerType: "getEnvironmentStatus",
        pluginName,
        defaultHandler: async () => defaultEnvironmentStatus,
      })

      const envStatus = await getStatusHandler!({ ctx, log: providerLog })
      if (envStatus.ready) {
        providerLog.success(`Provider is ready`)
      } else {
        providerLog.warn(`Provider is not ready (only checking status)`)
      }

      return envStatus
    }

    providerLog.info(`Preparing environment`)
    // TODO: avoid calling the handler manually
    const prepareHandler = await actions.provider["getPluginHandler"]({
      handlerType: "prepareEnvironment",
      pluginName,
      defaultHandler: async () => ({ status: { ready: true, outputs: {} } }),
    })

    const result = await prepareHandler!({ ctx, log: providerLog, force: this.forceInit })
    const status = result.status
    if (!status.ready) {
      providerLog.error("Failed initializing provider")
      throw new PluginError({
        message: `Provider ${pluginName} reports status as not ready and could not prepare the configured environment.`,
      })
    }

    providerLog.success("Provider ready")

    if (!status.disableCache) {
      await this.setCachedStatus(tmpProvider.config, status)
    }

    return status
  }
}

export function getProviderStatusCachePath({
  gardenDirPath,
  pluginName,
}: {
  gardenDirPath: string
  pluginName: string
}) {
  return join(gardenDirPath, CACHE_DIR_NAME, "provider-statuses", `${pluginName}.json`)
}
