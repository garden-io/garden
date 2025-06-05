/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deline } from "../util/string.js"
import {
  createSchema,
  joi,
  joiArray,
  joiIdentifier,
  joiIdentifierMap,
  joiSparseArray,
  joiUserIdentifier,
} from "./common.js"
import { ConfigurationError } from "../exceptions.js"
import type { ModuleConfig } from "./module.js"
import { moduleConfigSchema } from "./module.js"
import { isNumber, isString, memoize, uniq } from "lodash-es"
import type { GardenPluginSpec } from "../plugin/plugin.js"
import type { EnvironmentStatus } from "../plugin/handlers/Provider/getEnvironmentStatus.js"
import { environmentStatusSchema } from "./status.js"
import type { DashboardPage } from "../plugin/handlers/Provider/getDashboardPage.js"
import { dashboardPagesSchema } from "../plugin/handlers/Provider/getDashboardPage.js"
import type { ActionState } from "../actions/types.js"
import type { ValidResultType } from "../tasks/base.js"
import { uuidv4 } from "../util/random.js"
import { s } from "./zod.js"
import { defaultVisitorOpts, getContextLookupReferences, visitAll } from "../template/analysis.js"
import type { ConfigContext } from "./template-contexts/base.js"
import type { UnresolvedProviderConfig } from "./project.js"

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
  path?: string
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
  status: EnvironmentStatus
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
  [name: string]: Provider<BaseProviderConfig>
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
  config: BaseProviderConfig
  dependencies: ProviderMap
  moduleConfigs: ModuleConfig[]
  status: EnvironmentStatus
}): Provider {
  return {
    name: config.name,
    uid: uuidv4(),
    dependencies,
    moduleConfigs,
    config,
    state: status.ready ? "ready" : "not-ready",
    status,
    dashboardPages: plugin.dashboardPages,
    outputs: status.outputs,
  }
}

/**
 * Given a plugin and its provider config, return a list of dependency names based on declared dependencies,
 * as well as implicit dependencies based on template strings.
 */
export function getAllProviderDependencyNames(
  plugin: GardenPluginSpec,
  config: UnresolvedProviderConfig,
  context: ConfigContext
) {
  return uniq([
    ...(plugin.dependencies || []).map((d) => d.name),
    ...(config.dependencies || []),
    ...getProviderTemplateReferences(config, context),
  ]).sort()
}

/**
 * Given a provider config, return implicit dependencies based on template strings.
 */
export function getProviderTemplateReferences(config: UnresolvedProviderConfig, context: ConfigContext) {
  const deps: string[] = []

  const generator = getContextLookupReferences(
    visitAll({
      value: config.unresolvedConfig,
      opts: defaultVisitorOpts,
    }),
    context,
    {}
  )
  for (const finding of generator) {
    const keyPath = finding.keyPath
    if (keyPath[0] !== "providers") {
      continue
    }

    const providerName = keyPath[1]
    if (!providerName || isNumber(providerName)) {
      throw new ConfigurationError({
        message: deline`s
          Invalid template key '${keyPath.join(".")}' in configuration for provider '${config.name}'. You must
          specify a provider name as well (e.g. \${providers.my-provider}).
        `,
      })
    }
    if (!isString(providerName)) {
      const err = providerName.getError()
      throw new ConfigurationError({
        message: `Found invalid provider reference: ${err.message}`,
      })
    }

    deps.push(providerName)
  }

  return uniq(deps).sort()
}
