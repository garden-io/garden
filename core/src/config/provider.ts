/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deline } from "../util/string"
import {
  joiIdentifier,
  joiUserIdentifier,
  joiArray,
  joi,
  joiIdentifierMap,
  joiSparseArray,
  createSchema,
} from "./common"
import { collectTemplateReferences } from "../template-string/template-string"
import { ConfigurationError } from "../exceptions"
import { ModuleConfig, moduleConfigSchema } from "./module"
import { memoize, uniq } from "lodash"
import { GardenPluginSpec } from "../plugin/plugin"
import { EnvironmentStatus } from "../plugin/handlers/Provider/getEnvironmentStatus"
import { environmentStatusSchema } from "./status"
import { DashboardPage, dashboardPagesSchema } from "../plugin/handlers/Provider/getDashboardPage"
import type { ActionState } from "../actions/types"
import { ValidResultType } from "../tasks/base"
import { uuidv4 } from "../util/random"
import { s } from "./zod"

// TODO: dedupe from the joi schema below
export const baseProviderConfigSchemaZod = s.object({
  name: s.identifier().describe("The name of the provider plugin to use."),
  dependencies: s
    .sparseArray(s.identifier())
    .default([])
    .describe("List other providers that should be resolved before this one.")
    .example(["exec"]),
  environments: s
    .sparseArray(s.userIdentifier())
    .optional()
    .describe(
      deline`
        If specified, this provider will only be used in the listed environments. Note that an empty array effectively
        disables the provider. To use a provider in all environments, omit this field.
      `
    )
    .example(["dev", "stage"]),
})

export interface BaseProviderConfig {
  name: string
  dependencies?: string[]
  environments?: string[]
}

export interface GenericProviderConfig extends BaseProviderConfig {
  [key: string]: any
}

const providerFixedFieldsSchema = memoize(() =>
  joi.object().keys({
    name: joiIdentifier().required().description("The name of the provider plugin to use.").example("local-kubernetes"),
    dependencies: joiSparseArray(joiIdentifier())
      .description("List other providers that should be resolved before this one.")
      .example(["exec"]),
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
)

export const providerConfigBaseSchema = memoize(() =>
  providerFixedFieldsSchema().unknown(true).meta({ extendable: true }).id("providerConfig")
)

export interface Provider<T extends BaseProviderConfig = BaseProviderConfig> extends ValidResultType {
  name: string
  uid: string // This is generated at creation time, and is intended for use by plugins e.g. for caching purposes.
  dependencies: { [name: string]: Provider }
  environments?: string[]
  moduleConfigs: ModuleConfig[]
  config: T
  state: ActionState
  status: EnvironmentStatus | null
  dashboardPages: DashboardPage[]
  outputs: any
}

export const providerSchema = createSchema({
  name: "Provider",
  extend: providerFixedFieldsSchema,
  keys: () => ({
    dependencies: joiIdentifierMap(joi.link("..."))
      .description("Map of all the providers that this provider depends on.")
      .required(),
    uid: joi.string().required().meta({ internal: true }),
    config: providerConfigBaseSchema().required(),
    moduleConfigs: joiArray(moduleConfigSchema().optional()),
    status: environmentStatusSchema(),
    state: joi.string(),
    outputs: joi.any(),
    dashboardPages: dashboardPagesSchema(),
  }),
})

export interface ProviderMap {
  [name: string]: Provider<GenericProviderConfig>
}

export const defaultProviders = [{ name: "container" }]

// this is used for default handlers in the action handler
export const defaultProvider: Provider = {
  name: "_default",
  uid: uuidv4(),
  dependencies: {},
  moduleConfigs: [],
  state: "ready",
  config: { name: "_default" },
  status: { ready: true, outputs: {} },
  dashboardPages: [],
  outputs: {},
}

export function providerFromConfig({
  plugin,
  config,
  dependencies,
  moduleConfigs,
  status,
}: {
  plugin: GardenPluginSpec
  config: GenericProviderConfig
  dependencies: ProviderMap
  moduleConfigs: ModuleConfig[]
  status: EnvironmentStatus | null
}): Provider {
  return {
    name: config.name,
    uid: uuidv4(),
    dependencies,
    moduleConfigs,
    config,
    state: status ? (status.ready ? "ready" : "not-ready") : "unknown",
    status,
    dashboardPages: plugin.dashboardPages,
    outputs: status?.outputs || {},
  }
}

/**
 * Given a plugin and its provider config, return a list of dependency names based on declared dependencies,
 * as well as implicit dependencies based on template strings.
 */
export async function getAllProviderDependencyNames(plugin: GardenPluginSpec, config: GenericProviderConfig) {
  return uniq([
    ...(plugin.dependencies || []).map((d) => d.name),
    ...(config.dependencies || []),
    ...getProviderTemplateReferences(config),
  ]).sort()
}

/**
 * Given a provider config, return implicit dependencies based on template strings.
 */
export function getProviderTemplateReferences(config: GenericProviderConfig) {
  const references = collectTemplateReferences(config)
  const deps: string[] = []

  for (const key of references) {
    if (key[0] === "providers") {
      const providerName = key[1] as string
      if (!providerName) {
        throw new ConfigurationError({
          message: deline`
          Invalid template key '${key.join(".")}' in configuration for provider '${config.name}'. You must
          specify a provider name as well (e.g. \${providers.my-provider}).
        `,
        })
      }
      deps.push(providerName)
    }
  }

  return uniq(deps).sort()
}
