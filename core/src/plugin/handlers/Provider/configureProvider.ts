/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { projectNameSchema, projectRootSchema } from "../../../config/project.js"
import type { BaseProviderConfig, ProviderMap } from "../../../config/provider.js"
import { providerConfigBaseSchema, providerSchema } from "../../../config/provider.js"
import type { PluginActionParamsBase } from "../../base.js"
import { projectActionParamsSchema } from "../../base.js"
import { joiArray, joi, joiIdentifier, joiIdentifierMap } from "../../../config/common.js"
import type { ModuleConfig } from "../../../config/module.js"
import { moduleConfigSchema } from "../../../config/module.js"
import { deline, dedent } from "../../../util/string.js"
import type { ActionHandler } from "../../plugin.js"
import type { Log } from "../../../logger/log-entry.js"
import type { LocalConfigStore } from "../../../config-store/local.js"
import { configStoreSchema } from "../../../config-store/local.js"

// Note: These are the only plugin handler params that don't inherit from PluginActionParamsBase
export interface ConfigureProviderParams<T extends BaseProviderConfig = any> extends PluginActionParamsBase {
  config: T
  configStore: LocalConfigStore
  dependencies: ProviderMap
  environmentName: string
  log: Log
  namespace: string
  projectName: string
  projectRoot: string
  base?: ActionHandler<ConfigureProviderParams<T>, ConfigureProviderResult<T>>
}

export interface ConfigureProviderResult<T extends BaseProviderConfig = any> {
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
  paramsSchema: projectActionParamsSchema().keys({
    config: providerConfigBaseSchema(),
    environmentName: joiIdentifier(),
    namespace: joiIdentifier(),
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
