/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BaseTask, TaskParams, TaskType } from "./base"
import {
  GenericProviderConfig,
  Provider,
  providerFromConfig,
  getProviderTemplateReferences,
  ProviderMap,
} from "../config/provider"
import { resolveTemplateStrings } from "../template-string/template-string"
import { ConfigurationError, PluginError } from "../exceptions"
import { keyBy, omit, flatten, uniq } from "lodash"
import { GraphResults } from "../task-graph"
import { ProviderConfigContext } from "../config/template-contexts/provider"
import { ModuleConfig } from "../config/module"
import { GardenPlugin } from "../types/plugin/plugin"
import { joi } from "../config/common"
import { validateWithPath, validateSchema } from "../config/validation"
import Bluebird from "bluebird"
import { defaultEnvironmentStatus, EnvironmentStatus } from "../types/plugin/provider/getEnvironmentStatus"
import { getPluginBases, getPluginBaseNames } from "../plugins"
import { Profile } from "../util/profiling"
import { join, dirname } from "path"
import { readFile, writeFile, ensureDir } from "fs-extra"
import { deserialize, serialize } from "v8"
import { environmentStatusSchema } from "../config/status"
import { hashString } from "../util/util"
import { gardenEnv } from "../constants"
import { stableStringify } from "../util/string"

interface Params extends TaskParams {
  plugin: GardenPlugin
  config: GenericProviderConfig
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
export class ResolveProviderTask extends BaseTask {
  type: TaskType = "resolve-provider"
  concurrencyLimit = 20

  private config: GenericProviderConfig
  private plugin: GardenPlugin
  private forceRefresh: boolean
  private forceInit: boolean

  constructor(params: Params) {
    super(params)
    this.config = params.config
    this.plugin = params.plugin
    this.forceRefresh = params.forceRefresh
    this.forceInit = params.forceInit
    this.validate()
  }

  getName() {
    return this.config.name
  }

  getDescription() {
    return `resolving provider ${this.getName()}`
  }

  async resolveDependencies() {
    const pluginDeps = this.plugin.dependencies
    const explicitDeps = (this.config.dependencies || []).map((name) => ({ name }))
    const implicitDeps = (await getProviderTemplateReferences(this.config)).map((name) => ({ name }))
    const allDeps = uniq([...pluginDeps, ...explicitDeps, ...implicitDeps])

    const rawProviderConfigs = this.garden.getRawProviderConfigs()
    const plugins = keyBy(await this.garden.getAllPlugins(), "name")

    const matchDependencies = (depName: string) => {
      // Match against a provider if its name matches directly, or it inherits from a base named `depName`
      return rawProviderConfigs.filter(
        (c) => c.name === depName || getPluginBaseNames(c.name, plugins).includes(depName)
      )
    }

    // Make sure explicit dependencies are configured
    await Bluebird.map(pluginDeps, async (dep) => {
      const matched = matchDependencies(dep.name)

      if (matched.length === 0 && !dep.optional) {
        throw new ConfigurationError(
          `Provider '${this.config.name}' depends on provider '${dep.name}', which is not configured. ` +
            `You need to add '${dep.name}' to your project configuration for the '${this.config.name}' to work.`,
          { config: this.config, missingProviderName: dep.name }
        )
      }
    })

    return flatten(
      await Bluebird.map(allDeps, async (dep) => {
        return matchDependencies(dep.name).map((config) => {
          const plugin = plugins[config.name]

          return new ResolveProviderTask({
            garden: this.garden,
            plugin,
            config,
            log: this.log,
            version: this.version,
            forceRefresh: this.forceRefresh,
            forceInit: this.forceInit,
          })
        })
      })
    )
  }

  async process(dependencyResults: GraphResults) {
    const resolvedProviders: ProviderMap = keyBy(
      Object.values(dependencyResults).map((result) => result && result.output),
      "name"
    )

    // Return immediately if the provider has been previously resolved
    const alreadyResolvedProviders = this.garden["resolvedProviders"][this.config.name]
    if (alreadyResolvedProviders) {
      return alreadyResolvedProviders
    }

    const context = new ProviderConfigContext(this.garden, resolvedProviders, this.garden.variables)

    this.log.silly(`Resolving template strings for provider ${this.config.name}`)
    let resolvedConfig = resolveTemplateStrings(this.config, context)

    const providerName = resolvedConfig.name

    this.log.silly(`Validating ${providerName} config`)

    const validateConfig = (config: GenericProviderConfig) => {
      return <GenericProviderConfig>validateWithPath({
        config: omit(config, "path"),
        schema: this.plugin.configSchema || joi.object(),
        path: this.garden.projectRoot,
        projectRoot: this.garden.projectRoot,
        configType: "provider configuration",
        ErrorClass: ConfigurationError,
      })
    }

    resolvedConfig = validateConfig(resolvedConfig)
    resolvedConfig.path = this.garden.projectRoot

    let moduleConfigs: ModuleConfig[] = []

    this.log.silly(`Calling configureProvider on ${providerName}`)

    const actions = await this.garden.getActionRouter()

    // Validating the output config against the base plugins. This is important to make sure base handlers are
    // compatible with the config.
    const plugins = await this.garden.getAllPlugins()
    const pluginsByName = keyBy(plugins, "name")
    const plugin = pluginsByName[providerName]

    const configureOutput = await actions.configureProvider({
      ctx: await this.garden.getPluginContext(
        providerFromConfig({
          plugin,
          config: resolvedConfig,
          dependencies: {},
          moduleConfigs: [],
          status: { ready: false, outputs: {} },
        })
      ),
      environmentName: this.garden.environmentName,
      namespace: this.garden.namespace,
      pluginName: providerName,
      log: this.log,
      config: resolvedConfig,
      configStore: this.garden.configStore,
      projectName: this.garden.projectName,
      projectRoot: this.garden.projectRoot,
      dependencies: resolvedProviders,
    })

    this.log.silly(`Validating ${providerName} config returned from configureProvider handler`)
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

      this.log.silly(`Validating '${providerName}' config against '${base.name}' schema`)

      resolvedConfig = <GenericProviderConfig>validateWithPath({
        config: omit(resolvedConfig, "path"),
        schema: base.configSchema.unknown(true),
        path: this.garden.projectRoot,
        projectRoot: this.garden.projectRoot,
        configType: `provider configuration (base schema from '${base.name}' plugin)`,
        ErrorClass: ConfigurationError,
      })
    }

    this.log.silly(`Ensuring ${providerName} provider is ready`)

    const tmpProvider = providerFromConfig({
      plugin: this.plugin,
      config: resolvedConfig,
      dependencies: resolvedProviders,
      moduleConfigs,
      status: defaultEnvironmentStatus,
    })
    const status = await this.ensurePrepared(tmpProvider)

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
      environmentName: this.garden.environmentName,
    })
  }

  private hashConfig(config: GenericProviderConfig) {
    return hashString(stableStringify(config))
  }

  private async getCachedStatus(config: GenericProviderConfig): Promise<EnvironmentStatus | null> {
    const cachePath = this.getCachePath()

    this.log.silly(`Checking provider status cache for ${this.plugin.name} at ${cachePath}`)

    let cachedStatus: CachedStatus | null = null

    if (!this.forceRefresh) {
      try {
        const cachedData = deserialize(await readFile(cachePath))
        cachedStatus = validateSchema(cachedData, cachedStatusSchema)
      } catch (err) {
        // Can't find or read a cached status
        this.log.silly(`Unable to find or read provider status from ${cachePath}: ${err.message}`)
      }
    }

    if (!cachedStatus) {
      return null
    }

    const configHash = this.hashConfig(config)

    if (cachedStatus.configHash !== configHash) {
      this.log.silly(`Cached provider status at ${cachePath} does not match the current config`)
      return null
    }

    const ttl = gardenEnv.GARDEN_CACHE_TTL || defaultCacheTtl
    const cacheAge = (new Date().getTime() - cachedStatus?.resolvedAt.getTime()) / 1000

    if (cacheAge > ttl) {
      this.log.silly(`Cached provider status at ${cachePath} is out of date`)
      return null
    }

    return omit(cachedStatus, ["configHash", "resolvedAt"])
  }

  private async setCachedStatus(config: GenericProviderConfig, status: EnvironmentStatus) {
    const cachePath = this.getCachePath()
    this.log.silly(`Caching provider status for ${this.plugin.name} at ${cachePath}`)

    const cachedStatus: CachedStatus = {
      ...status,
      cached: true,
      resolvedAt: new Date(),
      configHash: this.hashConfig(config),
    }

    await ensureDir(dirname(cachePath))
    await writeFile(cachePath, serialize(cachedStatus))
  }

  private async ensurePrepared(tmpProvider: Provider) {
    const pluginName = tmpProvider.name
    const actions = await this.garden.getActionRouter()
    const ctx = await this.garden.getPluginContext(tmpProvider)

    this.log.silly(`Getting status for ${pluginName}`)

    // Check for cached provider status
    const cachedStatus = await this.getCachedStatus(tmpProvider.config)

    if (cachedStatus) {
      return cachedStatus
    }

    // TODO: avoid calling the handler manually (currently doing it to override the plugin context)
    const handler = await actions["getActionHandler"]({
      actionType: "getEnvironmentStatus",
      pluginName,
      defaultHandler: async () => defaultEnvironmentStatus,
    })

    let status = await handler!({ ctx, log: this.log })

    this.log.silly(`${pluginName} status: ${status.ready ? "ready" : "not ready"}`)

    if (this.forceInit || !status.ready) {
      // Deliberately setting the text on the parent log here
      this.log.setState(`Preparing environment...`)

      const envLogEntry = this.log.info({
        status: "active",
        section: pluginName,
        msg: "Configuring...",
      })

      // TODO: avoid calling the handler manually
      const prepareHandler = await actions["getActionHandler"]({
        actionType: "prepareEnvironment",
        pluginName,
        defaultHandler: async () => ({ status }),
      })
      const result = await prepareHandler!({ ctx, log: this.log, force: this.forceInit, status })

      status = result.status

      envLogEntry.setSuccess({ msg: chalk.green("Ready"), append: true })
    }

    if (!status.ready) {
      throw new PluginError(
        `Provider ${pluginName} reports status as not ready and could not prepare the configured environment.`,
        { name: pluginName, status, provider: tmpProvider }
      )
    }

    if (!status.disableCache) {
      await this.setCachedStatus(tmpProvider.config, status)
    }

    return status
  }
}

export function getProviderStatusCachePath({
  gardenDirPath,
  pluginName,
  environmentName,
}: {
  gardenDirPath: string
  pluginName: string
  environmentName: string
}) {
  return join(gardenDirPath, "cache", "provider-statuses", `${pluginName}.${environmentName}.json`)
}
