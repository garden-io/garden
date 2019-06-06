/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { deline } from "../util/string"
import { joiIdentifier, joiUserIdentifier, joiArray } from "./common"
import { collectTemplateReferences } from "../template-string"
import { ConfigurationError } from "../exceptions"
import { ModuleConfig, moduleConfigSchema } from "./module"
import { uniq } from "lodash"
import { GardenPlugin } from "../types/plugin/plugin"

export interface ProviderConfig {
  name: string
  environments?: string[]
  [key: string]: any
}

const providerFixedFieldsSchema = Joi.object()
  .keys({
    name: joiIdentifier()
      .required()
      .description("The name of the provider plugin to use.")
      .example("local-kubernetes"),
    environments: Joi.array().items(joiUserIdentifier())
      .optional()
      .description(deline`
        If specified, this provider will only be used in the listed environments. Note that an empty array effectively
        disables the provider. To use a provider in all environments, omit this field.
      `)
      .example([["dev", "stage"], {}]),
  })

export const providerConfigBaseSchema = providerFixedFieldsSchema
  .unknown(true)
  .meta({ extendable: true })

export interface Provider<T extends ProviderConfig = ProviderConfig> {
  name: string
  dependencies: Provider[]
  environments?: string[]
  moduleConfigs: ModuleConfig[]
  config: T
}

export const providerSchema = providerFixedFieldsSchema
  .keys({
    dependencies: Joi.lazy(() => providersSchema)
      .required(),
    config: Joi.lazy(() => providerConfigBaseSchema)
      .required(),
    moduleConfigs: joiArray(moduleConfigSchema.optional()),
  })

export const providersSchema = joiArray(providerSchema)
  .description("List of all the providers that this provider depdends on.")

export interface ProviderMap { [name: string]: Provider }

export const defaultProviders = [
  { name: "container" },
]

// this is used for default handlers in the action handler
export const defaultProvider: Provider = {
  name: "_default",
  dependencies: [],
  moduleConfigs: [],
  config: { name: "_default" },
}

export function providerFromConfig(
  config: ProviderConfig, dependencies: Provider[], moduleConfigs: ModuleConfig[],
): Provider {
  return {
    name: config.name,
    dependencies,
    moduleConfigs,
    config,
  }
}

export async function getProviderDependencies(plugin: GardenPlugin, config: ProviderConfig) {
  const deps: string[] = [...plugin.dependencies || []]

  // Implicit dependencies from template strings
  const references = await collectTemplateReferences(config)

  for (const key of references) {
    if (key[0] === "provider") {
      const providerName = key[1]
      if (!providerName) {
        throw new ConfigurationError(deline`
          Invalid template key '${key.join(".")}' in configuration for provider '${config.name}'. You must
          specify a provider name as well (e.g. \${provider.my-provider}).
        `, { config, key: key.join(".") },
        )
      }
      deps.push(providerName)
    }
  }

  return uniq(deps).sort()
}
