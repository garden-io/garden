/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BaseTask, TaskParams, TaskType } from "./base"
import { ProviderConfig, Provider, getAllProviderDependencyNames, providerFromConfig } from "../config/provider"
import { resolveTemplateStrings } from "../template-string"
import { ConfigurationError, PluginError } from "../exceptions"
import { keyBy, omit, flatten } from "lodash"
import { TaskResults } from "../task-graph"
import { ProviderConfigContext } from "../config/config-context"
import { ModuleConfig } from "../config/module"
import { GardenPlugin } from "../types/plugin/plugin"
import { validateWithPath, joi } from "../config/common"
import Bluebird from "bluebird"
import { defaultEnvironmentStatus } from "../types/plugin/provider/getEnvironmentStatus"
import { getPluginBases, getPluginBaseNames } from "../plugins"

interface Params extends TaskParams {
  plugin: GardenPlugin
  config: ProviderConfig
  forceInit: boolean
}

/**
 * Resolves the configuration for the specified provider.
 */
export class ResolveProviderTask extends BaseTask {
  type: TaskType = "resolve-provider"

  private config: ProviderConfig
  private plugin: GardenPlugin
  private forceInit: boolean

  constructor(params: Params) {
    super(params)
    this.config = params.config
    this.plugin = params.plugin
    this.forceInit = params.forceInit
  }

  getName() {
    return this.config.name
  }

  getDescription() {
    return `resolving provider ${this.getName()}`
  }

  async getDependencies() {
    const depNames = await getAllProviderDependencyNames(this.plugin, this.config)

    const rawProviderConfigs = this.garden.getRawProviderConfigs()
    const plugins = keyBy(await this.garden.getPlugins(), "name")

    return flatten(
      await Bluebird.map(depNames, async (depName) => {
        // Match against a provider if its name matches directly, or it inherits from a base named `depName`
        const matched = rawProviderConfigs.filter(
          (c) => c.name === depName || getPluginBaseNames(c.name, plugins).includes(depName)
        )

        if (matched.length === 0) {
          throw new ConfigurationError(
            `Provider '${this.config.name}' depends on provider '${depName}', which is not configured. ` +
              `You need to add '${depName}' to your project configuration for the '${this.config.name}' to work.`,
            { config: this.config, missingProviderName: depName }
          )
        }

        return matched.map((config) => {
          const plugin = plugins[depName]

          return new ResolveProviderTask({
            garden: this.garden,
            plugin,
            config,
            log: this.log,
            version: this.version,
            forceInit: this.forceInit,
          })
        })
      })
    )
  }

  async process(dependencyResults: TaskResults) {
    const resolvedProviders: Provider[] = Object.values(dependencyResults).map((result) => result && result.output)

    const context = new ProviderConfigContext(this.garden, resolvedProviders, this.garden.variables)

    this.log.silly(`Resolving template strings for provider ${this.config.name}`)
    let resolvedConfig = await resolveTemplateStrings(this.config, context)

    const providerName = resolvedConfig.name

    this.log.silly(`Validating ${providerName} config`)

    const validateConfig = (config: ProviderConfig) => {
      return <ProviderConfig>validateWithPath({
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

    const configureOutput = await actions.configureProvider({
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
    const plugins = await this.garden.getPlugins()
    const pluginsByName = keyBy(plugins, "name")
    const bases = getPluginBases(this.plugin, pluginsByName)

    for (const base of bases) {
      if (!base.configSchema) {
        continue
      }

      this.log.silly(`Validating '${providerName}' config against '${base.name}' schema`)

      resolvedConfig = <ProviderConfig>validateWithPath({
        config: omit(resolvedConfig, "path"),
        schema: base.configSchema.unknown(true),
        path: this.garden.projectRoot,
        projectRoot: this.garden.projectRoot,
        configType: `provider configuration (base schema from '${base.name}' plugin)`,
        ErrorClass: ConfigurationError,
      })
    }

    this.log.silly(`Ensuring ${providerName} provider is ready`)

    const tmpProvider = providerFromConfig(resolvedConfig, resolvedProviders, moduleConfigs, defaultEnvironmentStatus)
    const status = await this.ensurePrepared(tmpProvider)

    return providerFromConfig(resolvedConfig, resolvedProviders, moduleConfigs, status)
  }

  private async ensurePrepared(tmpProvider: Provider) {
    const pluginName = tmpProvider.name
    const actions = await this.garden.getActionRouter()
    const ctx = this.garden.getPluginContext(tmpProvider)

    this.log.silly(`Getting status for ${pluginName}`)

    // TODO: avoid calling the handler manually (currently doing it to override the plugin context)
    const handler = await actions["getActionHandler"]({
      actionType: "getEnvironmentStatus",
      pluginName,
      defaultHandler: async () => defaultEnvironmentStatus,
    })

    let status = await handler({ ctx, log: this.log })

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
      const result = await prepareHandler({ ctx, log: this.log, force: this.forceInit, status })

      status = result.status

      envLogEntry.setSuccess({ msg: chalk.green("Ready"), append: true })
    }

    if (!status.ready) {
      throw new PluginError(
        `Provider ${pluginName} reports status as not ready and could not prepare the configured environment.`,
        { name: pluginName, status, provider: tmpProvider }
      )
    }

    return status
  }
}
