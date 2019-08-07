/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { BaseTask, TaskParams, TaskType } from "./base"
import { ProviderConfig, Provider, getProviderDependencies, providerFromConfig } from "../config/provider"
import { resolveTemplateStrings } from "../template-string"
import { ConfigurationError, PluginError } from "../exceptions"
import { keyBy } from "lodash"
import { TaskResults } from "../task-graph"
import { ProviderConfigContext } from "../config/config-context"
import { ModuleConfig } from "../config/module"
import { GardenPlugin } from "../types/plugin/plugin"
import { validateWithPath } from "../config/common"
import * as Bluebird from "bluebird"
import { defaultEnvironmentStatus } from "../types/plugin/provider/getEnvironmentStatus"

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
    const deps = await getProviderDependencies(this.plugin, this.config)

    const rawProviderConfigs = keyBy(this.garden.getRawProviderConfigs(), "name")

    return Bluebird.map(deps, async (providerName) => {
      const config = rawProviderConfigs[providerName]

      if (!config) {
        throw new ConfigurationError(
          `Missing provider dependency '${providerName}' in configuration for provider '${this.config.name}'. ` +
          `Are you missing a provider configuration?`,
          { config: this.config, missingProviderName: providerName },
        )
      }

      const plugin = await this.garden.getPlugin(providerName)

      return new ResolveProviderTask({
        garden: this.garden,
        plugin,
        config,
        log: this.log,
        version: this.version,
        forceInit: this.forceInit,
      })
    })
  }

  async process(dependencyResults: TaskResults) {
    const resolvedProviders: Provider[] = Object.values(dependencyResults).map(result => result.output)

    const context = new ProviderConfigContext(this.garden.environmentName, this.garden.projectName, resolvedProviders)

    this.log.silly(`Resolving template strings for plugin ${this.config.name}`)
    let resolvedConfig = await resolveTemplateStrings(this.config, context)

    resolvedConfig.path = this.garden.projectRoot
    const providerName = resolvedConfig.name

    this.log.silly(`Validating ${providerName} config`)
    if (this.plugin.configSchema) {
      resolvedConfig = validateWithPath({
        config: resolvedConfig,
        schema: this.plugin.configSchema,
        path: resolvedConfig.path,
        projectRoot: this.garden.projectRoot,
        configType: "provider",
        ErrorClass: ConfigurationError,
      })
    }

    const configureHandler = (this.plugin.actions || {}).configureProvider

    let moduleConfigs: ModuleConfig[] = []

    if (configureHandler) {
      this.log.silly(`Calling configureProvider on ${providerName}`)

      const configureOutput = await configureHandler({
        log: this.log,
        config: resolvedConfig,
        configStore: this.garden.configStore,
        projectName: this.garden.projectName,
        dependencies: resolvedProviders,
      })

      resolvedConfig = configureOutput.config

      if (configureOutput.moduleConfigs) {
        moduleConfigs = configureOutput.moduleConfigs
      }
    }

    this.log.silly(`Ensuring ${providerName} provider is ready`)
    const tmpProvider = providerFromConfig(resolvedConfig, resolvedProviders, moduleConfigs, defaultEnvironmentStatus)
    const status = await this.ensurePrepared(tmpProvider)

    return providerFromConfig(resolvedConfig, resolvedProviders, moduleConfigs, status)
  }

  private async ensurePrepared(tmpProvider: Provider) {
    const pluginName = tmpProvider.name
    const actions = await this.garden.getActionHelper()
    const ctx = this.garden.getPluginContext(tmpProvider)

    this.log.silly(`Getting status for ${pluginName}`)

    const handler = await actions.getActionHandler({
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

      const prepareHandler = await actions.getActionHandler({
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
        { name: pluginName, status, provider: tmpProvider },
      )
    }

    return status
  }
}
