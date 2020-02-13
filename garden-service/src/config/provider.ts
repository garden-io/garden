/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deline } from "../util/string"
import { joiIdentifier, joiUserIdentifier, joiArray, joi } from "./common"
import { collectTemplateReferences } from "../template-string"
import { ConfigurationError } from "../exceptions"
import { ModuleConfig, moduleConfigSchema } from "./module"
import { uniq } from "lodash"
import { GardenPlugin } from "../types/plugin/plugin"
import { EnvironmentStatus } from "../types/plugin/provider/getEnvironmentStatus"
import { environmentStatusSchema } from "./status"

export interface ProviderConfig {
  name: string
  environments?: string[]
  [key: string]: any
}

const providerFixedFieldsSchema = joi.object().keys({
  name: joiIdentifier()
    .required()
    .description("The name of the provider plugin to use.")
    .example("local-kubernetes"),
  environments: joi
    .array()
    .items(joiUserIdentifier())
    .optional()
    .description(
      deline`
        If specified, this provider will only be used in the listed environments. Note that an empty array effectively
        disables the provider. To use a provider in all environments, omit this field.
      `
    )
    .example(["dev", "stage"]),
})

export const providerConfigBaseSchema = providerFixedFieldsSchema
  .unknown(true)
  .meta({ extendable: true })
  .id("providerConfig")

export interface Provider<T extends ProviderConfig = ProviderConfig> {
  name: string
  dependencies: Provider[]
  environments?: string[]
  moduleConfigs: ModuleConfig[]
  config: T
  status: EnvironmentStatus
}

export const providerSchema = providerFixedFieldsSchema
  .keys({
    dependencies: joiArray(joi.link("..."))
      .description("List of all the providers that this provider depends on.")
      .required(),
    config: providerConfigBaseSchema.required(),
    moduleConfigs: joiArray(moduleConfigSchema.optional()),
    status: environmentStatusSchema,
  })
  .id("provider")

export interface ProviderMap {
  [name: string]: Provider
}

export const defaultProviders = [{ name: "container" }]

// this is used for default handlers in the action handler
export const defaultProvider: Provider = {
  name: "_default",
  dependencies: [],
  moduleConfigs: [],
  config: { name: "_default" },
  status: { ready: true, outputs: {} },
}

export function providerFromConfig(
  config: ProviderConfig,
  dependencies: Provider[],
  moduleConfigs: ModuleConfig[],
  status: EnvironmentStatus
): Provider {
  return {
    name: config.name,
    dependencies,
    moduleConfigs,
    config,
    status,
  }
}

/**
 * Given a plugin and its provider config, return a list of dependency names based on declared dependencies,
 * as well as implicit dependencies based on template strings.
 */
export async function getAllProviderDependencyNames(plugin: GardenPlugin, config: ProviderConfig) {
  return uniq([...(plugin.dependencies || []), ...(await getProviderTemplateReferences(config))]).sort()
}

/**
 * Given a provider config, return implicit dependencies based on template strings.
 */
export async function getProviderTemplateReferences(config: ProviderConfig) {
  const references = await collectTemplateReferences(config)
  const deps: string[] = []

  for (const key of references) {
    if (key[0] === "providers") {
      const providerName = key[1]
      if (!providerName) {
        throw new ConfigurationError(
          deline`
          Invalid template key '${key.join(".")}' in configuration for provider '${config.name}'. You must
          specify a provider name as well (e.g. \${providers.my-provider}).
        `,
          { config, key: key.join(".") }
        )
      }
      deps.push(providerName)
    }
  }

  return uniq(deps).sort()
}
