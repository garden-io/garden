/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseTask, TaskParams, TaskType } from "./base"
import { ProviderConfig, Provider, getProviderDependencies, providerFromConfig } from "../config/provider"
import { resolveTemplateStrings } from "../template-string"
import { ConfigurationError } from "../exceptions"
import { keyBy } from "lodash"
import { TaskResults } from "../task-graph"
import { ProviderConfigContext } from "../config/config-context"
import { ModuleConfig } from "../config/module"
import { GardenPlugin } from "../types/plugin/plugin"
import { validateWithPath } from "../config/common"

interface Params extends TaskParams {
  plugin: GardenPlugin
  config: ProviderConfig
}

/**
 * Resolves the configuration for the specified provider.
 */
export class ResolveProviderTask extends BaseTask {
  type: TaskType = "resolve-provider"

  private config: ProviderConfig
  private plugin: GardenPlugin

  constructor(params: Params) {
    super(params)
    this.config = params.config
    this.plugin = params.plugin
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

    return deps.map(providerName => {
      const config = rawProviderConfigs[providerName]

      if (!config) {
        throw new ConfigurationError(
          `Missing provider dependency '${providerName}' in configuration for provider '${this.config.name}'. ` +
          `Are you missing a provider configuration?`,
          { config: this.config, missingProviderName: providerName },
        )
      }

      const plugin = this.garden.getPlugin(providerName)

      return new ResolveProviderTask({
        garden: this.garden,
        plugin,
        config,
        log: this.log,
        version: this.version,
      })
    })
  }

  async process(dependencyResults: TaskResults) {
    const resolvedProviders: Provider[] = Object.values(dependencyResults).map(result => result.output)

    const context = new ProviderConfigContext(this.garden.environmentName, resolvedProviders)
    let resolvedConfig = await resolveTemplateStrings(this.config, context)

    resolvedConfig.path = this.garden.projectRoot
    const providerName = resolvedConfig.name

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

    return providerFromConfig(resolvedConfig, resolvedProviders, moduleConfigs)
  }
}
