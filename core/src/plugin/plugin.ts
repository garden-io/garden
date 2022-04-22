/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import {
  CleanupEnvironmentParams,
  CleanupEnvironmentResult,
  cleanupEnvironment,
} from "./handlers/provider/cleanupEnvironment"
import {
  ConfigureProviderParams,
  ConfigureProviderResult,
  configureProvider,
} from "./handlers/provider/configureProvider"
import { DeleteSecretParams, DeleteSecretResult, deleteSecret } from "./handlers/provider/deleteSecret"
import {
  EnvironmentStatus,
  GetEnvironmentStatusParams,
  getEnvironmentStatus,
} from "./handlers/provider/getEnvironmentStatus"
import { GetSecretParams, GetSecretResult, getSecret } from "./handlers/provider/getSecret"
import {
  PrepareEnvironmentParams,
  PrepareEnvironmentResult,
  prepareEnvironment,
} from "./handlers/provider/prepareEnvironment"
import { SetSecretParams, SetSecretResult, setSecret } from "./handlers/provider/setSecret"
import { joiArray, joiIdentifier, joi, joiSchema } from "../config/common"
import { ActionHandler } from "./base"
import { mapValues } from "lodash"
import { getDebugInfo, DebugInfo, GetDebugInfoParams } from "./handlers/provider/getDebugInfo"
import { dedent } from "../util/string"
import { pluginCommandSchema, PluginCommand } from "./command"
import { AugmentGraphResult, AugmentGraphParams, augmentGraph } from "./handlers/provider/augmentGraph"
import { templateStringLiteral } from "../docs/common"
import { toolSchema, PluginToolSpec } from "./tools"
import {
  GetDashboardPageParams,
  GetDashboardPageResult,
  getDashboardPage,
  DashboardPage,
  dashboardPagesSchema,
} from "./handlers/provider/getDashboardPage"
import { baseHandlerSchema } from "./handlers/base/base"
import { getModuleActionDescriptions, ModuleTypeDefinition, ModuleTypeExtension } from "./moduleTypes"
import { PluginActionDescription } from "../../build/src/types/plugin/plugin"
import { PluginContext } from "../plugin-context"
import { join } from "path"

// FIXME: Reduce number of import updates needed
export * from "./base"
export * from "./moduleTypes"

export type PluginActionHandlers = {
  [P in keyof PluginActionParams]: ActionHandler<PluginActionParams[P], PluginActionOutputs[P]>
}

// export type AllActionHandlers<T extends GardenModule = GardenModule> = PluginActionHandlers &
//   ModuleAndRuntimeActionHandlers<T>

export type PluginActionName = keyof PluginActionHandlers

export interface PluginActionParams {
  configureProvider: ConfigureProviderParams
  augmentGraph: AugmentGraphParams

  getEnvironmentStatus: GetEnvironmentStatusParams
  prepareEnvironment: PrepareEnvironmentParams
  cleanupEnvironment: CleanupEnvironmentParams

  getSecret: GetSecretParams
  setSecret: SetSecretParams
  deleteSecret: DeleteSecretParams

  getDashboardPage: GetDashboardPageParams
  getDebugInfo: GetDebugInfoParams
}

export interface PluginActionOutputs {
  configureProvider: ConfigureProviderResult
  augmentGraph: AugmentGraphResult

  getEnvironmentStatus: EnvironmentStatus
  prepareEnvironment: PrepareEnvironmentResult
  cleanupEnvironment: CleanupEnvironmentResult

  getSecret: GetSecretResult
  setSecret: SetSecretResult
  deleteSecret: DeleteSecretResult

  getDashboardPage: GetDashboardPageResult
  getDebugInfo: DebugInfo
}

export interface PluginActionDescriptions {
  [actionName: string]: PluginActionDescription
}

// It takes a short while to resolve all these scemas, so we cache the result
let _pluginActionDescriptions: PluginActionDescriptions

export function getPluginActionDescriptions(): PluginActionDescriptions {
  if (_pluginActionDescriptions) {
    return _pluginActionDescriptions
  }

  const descriptions = {
    configureProvider,
    augmentGraph,

    getEnvironmentStatus,
    prepareEnvironment,
    cleanupEnvironment,

    getSecret,
    setSecret,
    deleteSecret,

    getDashboardPage,
    getDebugInfo,
  }

  _pluginActionDescriptions = <PluginActionDescriptions>mapValues(descriptions, (f) => {
    const desc = f()

    return {
      ...desc,
      paramsSchema: desc.paramsSchema.keys({
        base: baseHandlerSchema(),
      }),
    }
  })

  return _pluginActionDescriptions
}

export function getPluginActionNames() {
  return <PluginActionName[]>Object.keys(getPluginActionDescriptions())
}

export interface PluginDependency {
  name: string
  optional?: boolean
}

const pluginDependencySchema = () =>
  joi.object().keys({
    name: joi.string().required().description("The name of the plugin."),
    optional: joi
      .boolean()
      .description(
        "If set to true, the dependency is optional, meaning that if it is configured it should be loaded ahead of this plugin, but otherwise it is ignored. This is handy if plugins e.g. need to extend module types from other plugins but otherwise don't require the plugin to function."
      ),
  })

export interface GardenPluginSpec {
  name: string
  base?: string
  docs?: string

  configSchema?: Joi.ObjectSchema
  outputsSchema?: Joi.ObjectSchema

  dependencies?: PluginDependency[]

  handlers?: Partial<PluginActionHandlers>
  commands?: PluginCommand[]
  tools?: PluginToolSpec[]
  dashboardPages?: DashboardPage[]

  createModuleTypes?: ModuleTypeDefinition[]
  extendModuleTypes?: ModuleTypeExtension[]
}

export interface GardenPlugin extends GardenPluginSpec {
  dependencies: PluginDependency[]

  handlers: Partial<PluginActionHandlers>
  commands: PluginCommand[]

  createModuleTypes: ModuleTypeDefinition[]
  extendModuleTypes: ModuleTypeExtension[]

  dashboardPages: DashboardPage[]
}

export interface GardenPluginReference {
  name: string
  callback: GardenPluginCallback
}

export type GardenPluginCallback = () => GardenPlugin

export interface PluginMap {
  [name: string]: GardenPlugin
}

export type RegisterPluginParam = string | GardenPlugin | GardenPluginReference

const moduleHandlersSchema = () =>
  joi
    .object()
    .keys(mapValues(getModuleActionDescriptions(), () => joi.func()))
    .description("A map of module action handlers provided by the plugin.")

const extendModuleTypeSchema = () =>
  joi.object().keys({
    name: joiIdentifier().required().description("The name of module type."),
    handlers: moduleHandlersSchema(),
  })

const outputSchemaDocs = dedent`
The schema must be a single level object, with string keys. Each value must be a primitive
(null, boolean, number or string).

If no schema is provided, an error may be thrown if a plugin handler attempts to return an output key.

If the module type has a \`base\`, you must either omit this field to inherit the base's schema, make sure
that the specified schema is a _superset_ of the base's schema (i.e. only adds or further constrains existing fields),
_or_ override the necessary handlers to make sure their output matches the base's schemas.
This is to ensure that plugin handlers made for the base type also work with this module type.
`

const createModuleTypeSchema = () =>
  extendModuleTypeSchema().keys({
    base: joiIdentifier().description(dedent`
        Name of module type to use as a base for this module type.

        If specified, providers that support the base module type also work with this module type.
        Note that some constraints apply on the configuration and output schemas. Please see each of the schema
        fields for details.
      `),
    docs: joi.string().description("Documentation for the module type, in markdown format."),
    handlers: joi.object().keys(mapValues(getModuleActionDescriptions(), () => joi.func())).description(dedent`
        A map of module action handlers provided by the plugin.
      `),
    // TODO: specify the schemas using JSONSchema instead of Joi objects
    // TODO: validate outputs against the output schemas
    moduleOutputsSchema: joiSchema().description(dedent`
        A valid Joi schema describing the keys that each module outputs at config resolution time,
        for use in template strings (e.g. ${templateStringLiteral("modules.my-module.outputs.some-key")}).

        ${outputSchemaDocs}
      `),
    schema: joiSchema().description(dedent`
        A valid Joi schema describing the configuration keys for the \`module\` field in the module's \`garden.yml\`.

        If the module type has a \`base\`, you must either omit this field to inherit the base's schema, make sure
        that the specified schema is a _superset_ of the base's schema (i.e. only adds or further constrains existing
        fields), _or_ specify a \`configure\` handler that returns a module config compatible with the base's
        schema. This is to ensure that plugin handlers made for the base type also work with this module type.
      `),
    serviceOutputsSchema: joiSchema().description(dedent`
        A valid Joi schema describing the keys that each service outputs at runtime, for use in template strings
        and environment variables (e.g. ${templateStringLiteral("runtime.services.my-service.outputs.some-key")} and
        \`GARDEN_SERVICES_MY_SERVICE__OUTPUT_SOME_KEY\`).

        ${outputSchemaDocs}
      `),
    taskOutputsSchema: joiSchema().description(dedent`
        A valid Joi schema describing the keys that each task outputs at runtime, for use in template strings
        and environment variables (e.g. ${templateStringLiteral("runtime.tasks.my-task.outputs.some-key")} and
        \`GARDEN_TASKS_MY_TASK__OUTPUT_SOME_KEY\`).

        ${outputSchemaDocs}
      `),
    title: joi
      .string()
      .description(
        "Readable title for the module type. Defaults to the title-cased type name, with dashes replaced by spaces."
      ),
  })

export const pluginSchema = () =>
  joi
    .object()
    .keys({
      name: joiIdentifier().required().description("The name of the plugin."),
      base: joiIdentifier().description(dedent`
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

      docs: joi.string().description(dedent`
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
        The schema for the provider configuration (which the user specifies in the Garden Project configuration).

        If the provider has a \`base\` configured, this schema must describe a superset of the base plugin
        \`outputsSchema\`.
      `),

      handlers: joi.object().keys(mapValues(getPluginActionDescriptions(), () => joi.func())).description(dedent`
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

      dashboardPages: dashboardPagesSchema(),

      tools: joi.array().items(toolSchema()).unique("name").description(dedent`
        List of tools that this plugin exposes via \`garden tools <name>\`, and within its own plugin handlers and commands.

        The tools are downloaded automatically on first use, and cached under the user's global \`~/.garden\` directory.

        If multiple plugins specify a tool with the same name, you can reference them prefixed with the plugin name and a period, e.g. \`kubernetes.kubectl\` to pick a specific plugin's command. Otherwise a warning is emitted when running \`garden tools\`, and the tool that's configured by the plugin that is last in the dependency order is used. Since that can often be ambiguous, it is highly recommended to use the fully qualified name in automated scripts.

        If you specify a \`base\`, new tools are added in addition to the tools of the base plugin, and if you specify a tool with the same name as one in the base plugin, you override the one declared in the base.
      `),
    })
    .description("The schema for Garden plugins.")

export const pluginModuleSchema = () =>
  joi
    .object()
    .keys({
      gardenPlugin: pluginSchema().required(),
    })
    .unknown(true)
    .description("A module containing a Garden plugin.")

// This doesn't do much at the moment, but it makes sense to make this an SDK function to make it more future-proof
export function createGardenPlugin(spec: GardenPluginSpec): GardenPlugin {
  return {
    ...spec,
    dependencies: spec.dependencies || [],
    commands: spec.commands || [],
    createModuleTypes: spec.createModuleTypes || [],
    extendModuleTypes: spec.extendModuleTypes || [],
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
