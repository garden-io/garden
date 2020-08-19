/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { projectNameSchema, projectRootSchema } from "../../../config/project"
import { GenericProviderConfig, providerConfigBaseSchema, providerSchema, ProviderMap } from "../../../config/provider"
import { logEntrySchema, PluginActionParamsBase, actionParamsSchema } from "../base"
import { configStoreSchema, ConfigStore } from "../../../config-store"
import { joiArray, joi, joiIdentifier, joiIdentifierMap } from "../../../config/common"
import { moduleConfigSchema, ModuleConfig } from "../../../config/module"
import { deline, dedent } from "../../../util/string"
import { ActionHandler } from "../plugin"
import { LogEntry } from "../../../logger/log-entry"

// Note: These are the only plugin handler params that don't inherit from PluginActionParamsBase
export interface ConfigureProviderParams<T extends GenericProviderConfig = any> extends PluginActionParamsBase {
  config: T
  configStore: ConfigStore
  dependencies: ProviderMap
  environmentName: string
  log: LogEntry
  namespace?: string
  projectName: string
  projectRoot: string
  base?: ActionHandler<ConfigureProviderParams<T>, ConfigureProviderResult<T>>
}

export interface ConfigureProviderResult<T extends GenericProviderConfig = GenericProviderConfig> {
  config: T
  moduleConfigs?: ModuleConfig[]
}

export const configureProvider = () => ({
  description: dedent`
    Validate and transform the given provider configuration.

    Note that this does not need to perform structural schema validation (the framework does that
    automatically), but should in turn perform semantic validation to make sure the configuration is sane.

    This can also be used to further specify the semantics of the provider, including dependencies.

    Important: This action is called on most executions of Garden commands, so it should return quickly
    and avoid performing expensive processing or network calls.
  `,
  paramsSchema: actionParamsSchema().keys({
    config: providerConfigBaseSchema().required(),
    environmentName: joiIdentifier(),
    namespace: joiIdentifier(),
    log: logEntrySchema(),
    projectName: projectNameSchema(),
    projectRoot: projectRootSchema(),
    dependencies: joiIdentifierMap(providerSchema()).description("Map of all providers that this provider depends on."),
    configStore: configStoreSchema(),
  }),
  resultSchema: joi.object().keys({
    config: providerConfigBaseSchema(),
    moduleConfigs: joiArray(moduleConfigSchema()).description(deline`
          Providers may return one or more module configs, that are included with the provider. This can be used for
          modules that should always be built, or deployed as part of bootstrapping the provider.

          They become part of the project graph like other modules, but need to be referenced with the provider name
          as a prefix and a double dash, e.g. \`provider-name--module-name\`.
        `),
  }),
})
