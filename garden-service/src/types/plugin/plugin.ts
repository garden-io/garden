/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import { BuildModuleParams, BuildResult, build } from "./module/build"
import { BuildStatus, GetBuildStatusParams, getBuildStatus } from "./module/getBuildStatus"
import { CleanupEnvironmentParams, CleanupEnvironmentResult, cleanupEnvironment } from "./provider/cleanupEnvironment"
import { ConfigureModuleParams, ConfigureModuleResult, configure } from "./module/configure"
import { ConfigureProviderParams, ConfigureProviderResult, configureProvider } from "./provider/configureProvider"
import { DeleteSecretParams, DeleteSecretResult, deleteSecret } from "./provider/deleteSecret"
import { DeleteServiceParams, deleteService } from "./service/deleteService"
import { DeployServiceParams, deployService } from "./service/deployService"
import { EnvironmentStatus, GetEnvironmentStatusParams, getEnvironmentStatus } from "./provider/getEnvironmentStatus"
import { ExecInServiceParams, ExecInServiceResult, execInService } from "./service/execInService"
import { GetSecretParams, GetSecretResult, getSecret } from "./provider/getSecret"
import { GetServiceLogsParams, getServiceLogs } from "./service/getServiceLogs"
import { GetServiceStatusParams, getServiceStatus } from "./service/getServiceStatus"
import { GetTaskResultParams, getTaskResult } from "./task/getTaskResult"
import { GetTestResultParams, getTestResult, TestResult } from "./module/getTestResult"
import { HotReloadServiceParams, HotReloadServiceResult, hotReloadService } from "./service/hotReloadService"
import { PrepareEnvironmentParams, PrepareEnvironmentResult, prepareEnvironment } from "./provider/prepareEnvironment"
import { PublishModuleParams, PublishResult, publishModule } from "./module/publishModule"
import { RunModuleParams, runModule } from "./module/runModule"
import { RunServiceParams, runService } from "./service/runService"
import { RunTaskParams, RunTaskResult, runTask } from "./task/runTask"
import { SetSecretParams, SetSecretResult, setSecret } from "./provider/setSecret"
import { TestModuleParams, testModule } from "./module/testModule"
import { joiArray, joiIdentifier, joi, joiSchema } from "../../config/common"
import { Module } from "../module"
import { RunResult } from "./base"
import { ServiceStatus } from "../service"
import { mapValues } from "lodash"
import { getDebugInfo, DebugInfo, GetDebugInfoParams } from "./provider/getDebugInfo"
import { dedent } from "../../util/string"
import { pluginCommandSchema, PluginCommand } from "./command"
import { getPortForward, GetPortForwardParams, GetPortForwardResult } from "./service/getPortForward"
import { StopPortForwardParams, stopPortForward } from "./service/stopPortForward"
import { AugmentGraphResult, AugmentGraphParams, augmentGraph } from "./provider/augmentGraph"
import { suggestModules, SuggestModulesParams, SuggestModulesResult } from "./module/suggestModules"
import { templateStringLiteral } from "../../docs/common"

export interface ActionHandlerParamsBase {
  base?: ActionHandler<any, any>
}

export interface ActionHandler<P extends ActionHandlerParamsBase, O> {
  (params: P): Promise<O>
  actionType?: string
  pluginName?: string
  base?: WrappedActionHandler<P, O>
}

export interface ModuleActionHandler<P extends ActionHandlerParamsBase, O> extends ActionHandler<P, O> {
  (params: P): Promise<O>
  moduleType?: string
  base?: WrappedModuleActionHandler<P, O>
}

export interface WrappedActionHandler<P extends ActionHandlerParamsBase, O> extends ActionHandler<P, O> {
  actionType: string
  pluginName: string
}

export interface WrappedModuleActionHandler<P extends ActionHandlerParamsBase, O> extends WrappedActionHandler<P, O> {
  moduleType: string
  base?: WrappedModuleActionHandler<P, O>
}

export type PluginActionHandlers = {
  [P in keyof PluginActionParams]: ActionHandler<PluginActionParams[P], PluginActionOutputs[P]>
}

export type ModuleActionHandlers<T extends Module = Module> = {
  [P in keyof ModuleActionParams<T>]: ModuleActionHandler<ModuleActionParams<T>[P], ModuleActionOutputs[P]>
}

export type ServiceActionHandlers<T extends Module = Module> = {
  [P in keyof ServiceActionParams<T>]: ModuleActionHandler<ServiceActionParams<T>[P], ServiceActionOutputs[P]>
}

export type TaskActionHandlers<T extends Module = Module> = {
  [P in keyof TaskActionParams<T>]: ModuleActionHandler<TaskActionParams<T>[P], TaskActionOutputs[P]>
}

export type ModuleAndRuntimeActionHandlers<T extends Module = Module> = ModuleActionHandlers<T> &
  ServiceActionHandlers<T> &
  TaskActionHandlers<T>

export type AllActionHandlers<T extends Module = Module> = PluginActionHandlers & ModuleAndRuntimeActionHandlers<T>

export type PluginActionName = keyof PluginActionHandlers
export type ServiceActionName = keyof ServiceActionHandlers
export type TaskActionName = keyof TaskActionHandlers
export type ModuleActionName = keyof ModuleActionHandlers

export interface PluginActionDescription {
  description: string
  // TODO: specify the schemas using primitives and not Joi objects
  paramsSchema: Joi.ObjectSchema
  resultSchema: Joi.ObjectSchema
}

export interface PluginActionParams {
  configureProvider: ConfigureProviderParams
  augmentGraph: AugmentGraphParams

  getEnvironmentStatus: GetEnvironmentStatusParams
  prepareEnvironment: PrepareEnvironmentParams
  cleanupEnvironment: CleanupEnvironmentParams

  getSecret: GetSecretParams
  setSecret: SetSecretParams
  deleteSecret: DeleteSecretParams

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

  getDebugInfo: DebugInfo
}

// No way currently to further validate the shape of the super function
const baseHandlerSchema = () =>
  joi
    .func()
    .arity(1)
    .description(
      "When a handler is overriding a handler from a base plugin, this is provided to call the base handler. " +
        "This accepts the same parameters as the handler calling it."
    )

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

interface _ServiceActionParams<T extends Module = Module> {
  deployService: DeployServiceParams<T>
  deleteService: DeleteServiceParams<T>
  execInService: ExecInServiceParams<T>
  getPortForward: GetPortForwardParams<T>
  getServiceLogs: GetServiceLogsParams<T>
  getServiceStatus: GetServiceStatusParams<T>
  hotReloadService: HotReloadServiceParams<T>
  runService: RunServiceParams<T>
  stopPortForward: StopPortForwardParams<T>
}

// Specify base parameter more precisely than the base schema
export type ServiceActionParams<T extends Module = Module> = {
  [P in keyof _ServiceActionParams<T>]: _ServiceActionParams<T>[P] & {
    base?: WrappedModuleActionHandler<_ServiceActionParams<T>[P], ServiceActionOutputs[P]>
  }
}

export interface ServiceActionOutputs {
  deployService: ServiceStatus
  deleteService: ServiceStatus
  execInService: ExecInServiceResult
  getPortForward: GetPortForwardResult
  getServiceLogs: {}
  getServiceStatus: ServiceStatus
  hotReloadService: HotReloadServiceResult
  runService: RunResult
  stopPortForward: {}
}

const serviceActionDescriptions: { [P in ServiceActionName]: () => PluginActionDescription } = {
  deployService,
  deleteService,
  execInService,
  getPortForward,
  getServiceLogs,
  getServiceStatus,
  hotReloadService,
  runService,
  stopPortForward,
}

interface _TaskActionParams<T extends Module = Module> {
  getTaskResult: GetTaskResultParams<T>
  runTask: RunTaskParams<T>
}

// Specify base parameter more precisely than the base schema
export type TaskActionParams<T extends Module = Module> = {
  [P in keyof _TaskActionParams<T>]: _TaskActionParams<T>[P] & {
    base?: WrappedModuleActionHandler<_TaskActionParams<T>[P], TaskActionOutputs[P]>
  }
}

export interface TaskActionOutputs {
  runTask: RunTaskResult
  getTaskResult: RunTaskResult | null
}

const taskActionDescriptions: { [P in TaskActionName]: () => PluginActionDescription } = {
  getTaskResult,
  runTask,
}

interface _ModuleActionParams<T extends Module = Module> {
  configure: ConfigureModuleParams<T>
  suggestModules: SuggestModulesParams
  getBuildStatus: GetBuildStatusParams<T>
  build: BuildModuleParams<T>
  publish: PublishModuleParams<T>
  runModule: RunModuleParams<T>
  testModule: TestModuleParams<T>
  getTestResult: GetTestResultParams<T>
}

// Specify base parameter more precisely than the base schema
export type ModuleActionParams<T extends Module = Module> = {
  [P in keyof _ModuleActionParams<T>]: _ModuleActionParams<T>[P] & {
    base?: WrappedModuleActionHandler<_ModuleActionParams<T>[P], ModuleActionOutputs[P]>
  }
}

export interface ModuleActionOutputs extends ServiceActionOutputs {
  configure: ConfigureModuleResult
  suggestModules: SuggestModulesResult
  getBuildStatus: BuildStatus
  build: BuildResult
  publish: PublishResult
  runModule: RunResult
  testModule: TestResult
  getTestResult: TestResult | null
}

// It takes a short while to resolve all these scemas, so we cache the result
let _moduleActionDescriptions: PluginActionDescriptions

export function getModuleActionDescriptions(): PluginActionDescriptions {
  if (_moduleActionDescriptions) {
    return _moduleActionDescriptions
  }

  const descriptions = {
    configure,
    suggestModules,
    getBuildStatus,
    build,
    publish: publishModule,
    runModule,
    testModule,
    getTestResult,

    ...serviceActionDescriptions,
    ...taskActionDescriptions,
  }

  _moduleActionDescriptions = <PluginActionDescriptions>mapValues(descriptions, (f) => {
    const desc = f()

    return {
      ...desc,
      paramsSchema: desc.paramsSchema.keys({
        base: baseHandlerSchema(),
      }),
    }
  })

  return _moduleActionDescriptions
}

export function getPluginActionNames() {
  return <PluginActionName[]>Object.keys(getPluginActionDescriptions())
}

export function getModuleActionNames() {
  return <ModuleActionName[]>Object.keys(getModuleActionDescriptions())
}

export interface ModuleTypeExtension {
  handlers: Partial<ModuleAndRuntimeActionHandlers>
  name: string
}

export interface ModuleTypeDefinition extends ModuleTypeExtension {
  base?: string
  docs: string
  // TODO: specify the schemas using primitives (e.g. JSONSchema/OpenAPI) and not Joi objects
  moduleOutputsSchema?: Joi.ObjectSchema
  schema?: Joi.ObjectSchema
  serviceOutputsSchema?: Joi.ObjectSchema
  taskOutputsSchema?: Joi.ObjectSchema
  title?: string
}

export interface ModuleType extends ModuleTypeDefinition {
  plugin: GardenPlugin
  needsBuild: boolean
}

export interface ModuleTypeMap {
  [name: string]: ModuleType
}

interface GardenPluginSpec {
  name: string
  base?: string
  docs?: string

  configSchema?: Joi.ObjectSchema
  outputsSchema?: Joi.ObjectSchema

  dependencies?: string[]

  handlers?: Partial<PluginActionHandlers>
  commands?: PluginCommand[]

  createModuleTypes?: ModuleTypeDefinition[]
  extendModuleTypes?: ModuleTypeExtension[]
}

export interface GardenPlugin extends GardenPluginSpec {
  dependencies: string[]

  handlers: Partial<PluginActionHandlers>
  commands: PluginCommand[]

  createModuleTypes: ModuleTypeDefinition[]
  extendModuleTypes: ModuleTypeExtension[]
}

export interface PluginMap {
  [name: string]: GardenPlugin
}

export type RegisterPluginParam = string | GardenPlugin

const moduleHandlersSchema = () =>
  joi
    .object()
    .keys(mapValues(getModuleActionDescriptions(), () => joi.func()))
    .description("A map of module action handlers provided by the plugin.")

const extendModuleTypeSchema = () =>
  joi.object().keys({
    name: joiIdentifier()
      .required()
      .description("The name of module type."),
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
      name: joiIdentifier()
        .required()
        .description("The name of the plugin."),
      base: joiIdentifier().description(dedent`
        Name of a plugin to use as a base for this plugin. If you specify this, your provider will inherit all of the
        schema and functionality from the base plugin. Please review other fields for information on how individual
        fields can be overridden or extended.
      `),
      dependencies: joiArray(joi.string()).description(dedent`
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

      commands: joi
        .array()
        .items(pluginCommandSchema())
        .unique("name").description(dedent`
        List of commands that this plugin exposes (via \`garden plugins <plugin name>\`.

        If you specify a \`base\`, new commands are added in addition to the commands of the base plugin, and if you
        specify a command with the same name as one in the base plugin, you can override the original.
        Any command you override will receive a \`base\` parameter with the overridden handler, so that you can
        optionally call the original command from the base plugin.
      `),

      createModuleTypes: joi
        .array()
        .items(createModuleTypeSchema())
        .unique("name").description(dedent`
        List of module types to create.

        If you specify a \`base\`, these module types are added in addition to the module types created by the base
        plugin. To augment the base plugin's module types, use the \`extendModuleTypes\` field.
      `),
      extendModuleTypes: joi
        .array()
        .items(extendModuleTypeSchema())
        .unique("name").description(dedent`
        List of module types to extend/override with additional handlers.
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
export function createGardenPlugin(spec: GardenPluginSpec | (() => GardenPluginSpec)): GardenPlugin {
  if (typeof spec === "function") {
    spec = spec()
  }

  return {
    ...spec,
    dependencies: spec.dependencies || [],
    commands: spec.commands || [],
    createModuleTypes: spec.createModuleTypes || [],
    extendModuleTypes: spec.extendModuleTypes || [],
    handlers: spec.handlers || {},
  }
}
