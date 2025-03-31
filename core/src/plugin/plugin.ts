/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { joiArray, joiIdentifier, joi, joiSchema, createSchema } from "../config/common.js"
import { mapValues } from "lodash-es"
import { dedent } from "../util/string.js"
import type { PluginCommand } from "./command.js"
import { pluginCommandSchema } from "./command.js"
import type { PluginToolSpec } from "./tools.js"
import { toolSchema } from "./tools.js"
import type { DashboardPage } from "./handlers/Provider/getDashboardPage.js"
import { dashboardPagesSchema } from "./handlers/Provider/getDashboardPage.js"
import type { ModuleTypeDefinition, ModuleTypeExtension } from "./module-types.js"
import { createModuleTypeSchema, extendModuleTypeSchema } from "./module-types.js"
import type { ProviderHandlers } from "./providers.js"
import { getProviderActionDescriptions } from "./providers.js"
import type { ManyActionTypeDefinitions, ManyActionTypeExtensions } from "./action-types.js"
import { createActionTypesSchema, extendActionTypesSchema } from "./action-types.js"
import type { PluginContext } from "../plugin-context.js"
import { join } from "path"
import type { GardenSdkPlugin } from "./sdk.js"
import { providerConfigBaseSchema } from "../config/provider.js"

// FIXME: Reduce number of import updates needed
export * from "./base.js"
export * from "./module-types.js"
export * from "./providers.js"

export interface PluginDependency {
  name: string
  optional?: boolean
}

const pluginDependencySchema = createSchema({
  name: "plugin-dependency",
  keys: () => ({
    name: joi.string().required().description("The name of the plugin."),
    optional: joi
      .boolean()
      .description(
        "If set to true, the dependency is optional, meaning that if it is configured it should be loaded ahead of this plugin, but otherwise it is ignored. This is handy if plugins e.g. need to extend module types from other plugins but otherwise don't require the plugin to function."
      ),
  }),
})

export interface PartialGardenPluginSpec {
  name: string
  base?: string | null
  docs?: string | null

  configSchema?: Joi.ObjectSchema
  outputsSchema?: Joi.ObjectSchema

  dependencies?: PluginDependency[]

  handlers?: Partial<ProviderHandlers>
  commands?: PluginCommand[]
  tools?: PluginToolSpec[]
  dashboardPages?: DashboardPage[]

  createModuleTypes?: ModuleTypeDefinition[]
  extendModuleTypes?: ModuleTypeExtension[]

  createActionTypes?: Partial<ManyActionTypeDefinitions>
  extendActionTypes?: Partial<ManyActionTypeExtensions>
}

export type GardenPluginSpec = Required<Omit<PartialGardenPluginSpec, "configSchema" | "outputsSchema">> & {
  configSchema?: Joi.ObjectSchema
  outputsSchema?: Joi.ObjectSchema
  createActionTypes: ManyActionTypeDefinitions
  extendActionTypes: ManyActionTypeExtensions
}

export interface GardenPluginReference {
  name: string
  callback: GardenPluginCallback
}

export type GardenPluginCallback = () => GardenPluginSpec | Promise<GardenPluginSpec>

export interface PluginMap {
  [name: string]: GardenPluginSpec
}

export type RegisterPluginParam = string | GardenPluginSpec | GardenPluginReference | GardenSdkPlugin

export const pluginSchema = createSchema({
  name: "plugin",
  description: "The schema for Garden plugins.",
  keys: () => ({
    name: joiIdentifier().required().description("The name of the plugin."),
    base: joiIdentifier().allow(null).description(dedent`
      Name of a plugin to use as a base for this plugin. If you specify this, your provider will inherit all of the
      schema and functionality from the base plugin. Please review other fields for information on how individual
      fields can be overridden or extended.
    `),
    dependencies: joiArray(pluginDependencySchema()).description(dedent`
      Names of plugins that need to be configured prior to this plugin. This plugin will be able to reference the
      configuration from the listed plugins. Note that the dependencies will not be implicitly configured—the user
      will need to explicitly configure them in their project configuration.

      If you specify a \`base\`, these dependencies are added in addition to the dependencies of the base plugin.

      When you specify a dependency which matches another plugin's \`base\`, that plugin will be matched. This
      allows you to depend on at least one instance of a plugin of a certain base type being configured, without
      having to explicitly depend on any specific sub-type of that base. Note that this means that a single declared
      dependency may result in a match with multiple other plugins, if they share a matching base plugin.
    `),

    docs: joi.string().allow(null).description(dedent`
      A description of the provider, in markdown format. Please provide a useful introduction, and link to any
      other relevant documentation, such as guides, examples and module types.
    `),

    // TODO: make this a JSON/OpenAPI schema for portability
    configSchema: joiSchema().unknown(true).description(dedent`
      The schema for the provider configuration (which the user specifies in the Garden Project configuration).

      If the provider has a \`base\` configured, this schema must either describe a superset of the base plugin
      \`configSchema\` _or_ you must specify a \`configureProvider\` handler which returns a configuration that
      matches the base plugin's schema. This is to guarantee that the handlers from the base plugin get the
      configuration schema they expect.
    `),

    outputsSchema: joiSchema().unknown(true).description(dedent`
      The schema for the outputs from the provider.

      If the provider has a \`base\` configured, this schema must describe a superset of the base plugin
      \`outputsSchema\`.
    `),

    handlers: joi.object().keys(mapValues(getProviderActionDescriptions(), () => joi.func())).description(dedent`
      A map of plugin action handlers provided by the plugin.

      If you specify a \`base\`, you can use this field to add new handlers or override the handlers from the base
      plugin. Any handlers you override will receive a \`base\` parameter with the overridden handler, so that you
      can optionally call the original handler from the base plugin.
    `),

    commands: joi.array().items(pluginCommandSchema()).unique("name").description(dedent`
      List of commands that this plugin exposes (via \`garden plugins <plugin name>\`.

      If you specify a \`base\`, new commands are added in addition to the commands of the base plugin, and if you
      specify a command with the same name as one in the base plugin, you can override the original.
      Any command you override will receive a \`base\` parameter with the overridden handler, so that you can
      optionally call the original command from the base plugin.
    `),

    createModuleTypes: joi.array().items(createModuleTypeSchema()).unique("name").description(dedent`
      List of module types to create.

      If you specify a \`base\`, these module types are added in addition to the module types created by the base
      plugin. To augment the base plugin's module types, use the \`extendModuleTypes\` field.
    `),
    extendModuleTypes: joi.array().items(extendModuleTypeSchema()).unique("name").description(dedent`
      List of module types to extend/override with additional handlers.
    `),

    createActionTypes: createActionTypesSchema().description(dedent`
      Define one or more action types.

      If you specify a \`base\`, these module types are added in addition to the action types created by the base
      plugin. To augment the base plugin's action types, use the \`extendActionTypes\` field.
    `),
    extendActionTypes: extendActionTypesSchema().description(dedent`
      Extend one or more action types by adding new or overriding existing handlers.
    `),

    dashboardPages: dashboardPagesSchema(),

    tools: joi.array().items(toolSchema()).unique("name").description(dedent`
      List of tools that this plugin exposes via \`garden tools <name>\`, and within its own plugin handlers and commands.

      The tools are downloaded automatically on first use, and cached under the user's global \`~/.garden\` directory.

      If multiple plugins specify a tool with the same name, you can reference them prefixed with the plugin name and a period, e.g. \`kubernetes.kubectl\` to pick a specific plugin's command. Otherwise a warning is emitted when running \`garden tools\`, and the tool that's configured by the plugin that is last in the dependency order is used. Since that can often be ambiguous, it is highly recommended to use the fully qualified name in automated scripts.

      If you specify a \`base\`, new tools are added in addition to the tools of the base plugin, and if you specify a tool with the same name as one in the base plugin, you override the one declared in the base.
    `),
  }),
})

export const pluginNodeModuleSchema = createSchema({
  name: "plugin-node-module",
  description: "A Node.JS module containing a Garden plugin.",
  allowUnknown: true,
  keys: () => ({
    gardenPlugin: pluginSchema().required(),
  }),
})

export function createGardenPlugin(spec: PartialGardenPluginSpec): GardenPluginSpec {
  // Default to empty schemas if no base is set
  const configSchema = spec.configSchema || (spec.base ? undefined : providerConfigBaseSchema())
  const outputsSchema = spec.outputsSchema || (spec.base ? undefined : joi.object().keys({}))

  return {
    ...spec,
    base: spec.base || null,
    docs: spec.docs || null,
    configSchema,
    outputsSchema,
    tools: spec.tools || [],
    dependencies: spec.dependencies || [],
    commands: spec.commands || [],
    createModuleTypes: spec.createModuleTypes || [],
    extendModuleTypes: spec.extendModuleTypes || [],
    createActionTypes: {
      Build: [],
      Deploy: [],
      Run: [],
      Test: [],
      ...(spec.createActionTypes || {}),
    },
    extendActionTypes: {
      Build: [],
      Deploy: [],
      Run: [],
      Test: [],
      ...(spec.extendActionTypes || {}),
    },
    handlers: spec.handlers || {},
    dashboardPages: spec.dashboardPages || [],
  }
}

/**
 * A directory inside the project-level `.garden` directory where the plugin can write output files. This can be useful
 * e.g. when the plugin wants to maintain a local cache of some kind.
 */
export function getPluginOutputsPath(ctx: PluginContext, pluginName: string): string {
  return join(ctx.gardenDirPath, `${pluginName}.outputs`)
}
