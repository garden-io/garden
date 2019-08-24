/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
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
import { joiArray, joiIdentifier, joi } from "../../config/common"
import { Module } from "../module"
import { RunResult } from "./base"
import { ServiceStatus } from "../service"
import { mapValues } from "lodash"
import { getDebugInfo, DebugInfo, GetDebugInfoParams } from "./provider/getDebugInfo"
import { deline, dedent } from "../../util/string"
import { pluginCommandSchema, PluginCommand } from "./command"
import { getPortForward, GetPortForwardParams, GetPortForwardResult } from "./service/getPortForward"
import { StopPortForwardParams, stopPortForward } from "./service/stopPortForward"

export type ServiceActionHandlers<T extends Module = Module> = {
  [P in keyof ServiceActionParams<T>]: (params: ServiceActionParams<T>[P]) => ServiceActionOutputs[P]
}

export type TaskActionHandlers<T extends Module = Module> = {
  [P in keyof TaskActionParams<T>]: (params: TaskActionParams<T>[P]) => TaskActionOutputs[P]
}

export type ModuleActionHandlers<T extends Module = Module> = {
  [P in keyof ModuleActionParams<T>]: (params: ModuleActionParams<T>[P]) => ModuleActionOutputs[P]
}

export type ModuleAndRuntimeActionHandlers<T extends Module = Module> =
  ModuleActionHandlers<T> & ServiceActionHandlers<T> & TaskActionHandlers<T>

export type PluginActionName = keyof PluginActionHandlers
export type ServiceActionName = keyof ServiceActionHandlers
export type TaskActionName = keyof TaskActionHandlers
export type ModuleActionName = keyof ModuleActionHandlers

export interface PluginActionDescription {
  description: string
  // TODO: specify the schemas using primitives and not Joi objects
  paramsSchema: Joi.Schema
  resultSchema: Joi.Schema
}

export interface PluginActionParams {
  configureProvider: ConfigureProviderParams

  getEnvironmentStatus: GetEnvironmentStatusParams
  prepareEnvironment: PrepareEnvironmentParams
  cleanupEnvironment: CleanupEnvironmentParams

  getSecret: GetSecretParams
  setSecret: SetSecretParams
  deleteSecret: DeleteSecretParams

  getDebugInfo: GetDebugInfoParams
}

export interface PluginActionOutputs {
  configureProvider: Promise<ConfigureProviderResult>

  getEnvironmentStatus: Promise<EnvironmentStatus>
  prepareEnvironment: Promise<PrepareEnvironmentResult>
  cleanupEnvironment: Promise<CleanupEnvironmentResult>

  getSecret: Promise<GetSecretResult>
  setSecret: Promise<SetSecretResult>
  deleteSecret: Promise<DeleteSecretResult>

  getDebugInfo: Promise<DebugInfo>
}

export type PluginActionHandlers = {
  [P in keyof PluginActionParams]: (params: PluginActionParams[P]) => PluginActionOutputs[P]
}

export const pluginActionDescriptions: { [P in PluginActionName]: PluginActionDescription } = {
  configureProvider,
  getEnvironmentStatus,
  prepareEnvironment,
  cleanupEnvironment,

  getSecret,
  setSecret,
  deleteSecret,

  getDebugInfo,
}

export interface ServiceActionParams<T extends Module = Module> {
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

export interface ServiceActionOutputs {
  deployService: Promise<ServiceStatus>
  deleteService: Promise<ServiceStatus>
  execInService: Promise<ExecInServiceResult>
  getPortForward: Promise<GetPortForwardResult>
  getServiceLogs: Promise<{}>
  getServiceStatus: Promise<ServiceStatus>
  hotReloadService: Promise<HotReloadServiceResult>
  runService: Promise<RunResult>
  stopPortForward: Promise<{}>
}

export const serviceActionDescriptions: { [P in ServiceActionName]: PluginActionDescription } = {
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

export interface TaskActionParams<T extends Module = Module> {
  getTaskResult: GetTaskResultParams<T>
  runTask: RunTaskParams<T>
}

export interface TaskActionOutputs {
  runTask: Promise<RunTaskResult>
  getTaskResult: Promise<RunTaskResult | null>
}

export const taskActionDescriptions: { [P in TaskActionName]: PluginActionDescription } = {
  getTaskResult,
  runTask,
}

export interface ModuleActionParams<T extends Module = Module> {
  configure: ConfigureModuleParams<T>
  getBuildStatus: GetBuildStatusParams<T>
  build: BuildModuleParams<T>
  publish: PublishModuleParams<T>
  runModule: RunModuleParams<T>
  testModule: TestModuleParams<T>
  getTestResult: GetTestResultParams<T>
}

export interface ModuleActionOutputs extends ServiceActionOutputs {
  configure: Promise<ConfigureModuleResult>
  getBuildStatus: Promise<BuildStatus>
  build: Promise<BuildResult>
  publish: Promise<PublishResult>
  runModule: Promise<RunResult>
  testModule: Promise<TestResult>
  getTestResult: Promise<TestResult | null>
}

export const moduleActionDescriptions:
  { [P in ModuleActionName | ServiceActionName | TaskActionName]: PluginActionDescription } = {
  configure,
  getBuildStatus,
  build,
  publish: publishModule,
  runModule,
  testModule,
  getTestResult,

  ...serviceActionDescriptions,
  ...taskActionDescriptions,
}

export const pluginActionNames: PluginActionName[] = <PluginActionName[]>Object.keys(pluginActionDescriptions)
export const moduleActionNames: ModuleActionName[] = <ModuleActionName[]>Object.keys(moduleActionDescriptions)

export interface ModuleTypeExtension {
  handlers: Partial<ModuleAndRuntimeActionHandlers>
  name: string
}

export interface ModuleTypeDefinition extends ModuleTypeExtension {
  docs: string
  // TODO: specify the schemas using primitives (e.g. JSONSchema/OpenAPI) and not Joi objects
  moduleOutputsSchema?: Joi.ObjectSchema
  schema: Joi.ObjectSchema
  serviceOutputsSchema?: Joi.ObjectSchema
  taskOutputsSchema?: Joi.ObjectSchema
  title?: string
}

export interface GardenPluginSpec {
  name: string
  base?: string

  configSchema?: Joi.ObjectSchema,
  configKeys?: string[]
  outputsSchema?: Joi.ObjectSchema,

  dependencies?: string[]

  handlers?: Partial<PluginActionHandlers>
  commands?: PluginCommand[]

  createModuleTypes?: ModuleTypeDefinition[]
  extendModuleTypes?: ModuleTypeExtension[]
}

export interface GardenPlugin extends GardenPluginSpec { }

export type RegisterPluginParam = string | GardenPlugin

const extendModuleTypeSchema = joi.object()
  .keys({
    name: joiIdentifier()
      .required()
      .description("The name of module type."),
    handlers: joi.object().keys(mapValues(moduleActionDescriptions, () => joi.func()))
      .description("A map of module action handlers provided by the plugin."),
  })

const createModuleTypeSchema = extendModuleTypeSchema
  .keys({
    // base: joiIdentifier()
    //   .description(dedent`
    //     Name of module type to use as a base for this module type.
    //   `),
    docs: joi.string()
      .required()
      .description("Documentation for the module type, in markdown format."),
    // TODO: specify the schemas using primitives and not Joi objects
    moduleOutputsSchema: joi.object()
      .default(() => joi.object().keys({}), "{}")
      .description(dedent`
        A valid Joi schema describing the keys that each module outputs at config time, for use in template strings
        (e.g. \`\${modules.my-module.outputs.some-key}\`).

        If no schema is provided, an error may be thrown if a module attempts to return an output.
      `),
    schema: joi.object()
      .required()
      .description(
        "A valid Joi schema describing the configuration keys for the `module` " +
        "field in the module's `garden.yml`.",
      ),
    serviceOutputsSchema: joi.object()
      .default(() => joi.object().keys({}), "{}")
      .description(dedent`
        A valid Joi schema describing the keys that each service outputs at runtime, for use in template strings
        and environment variables (e.g. \`\${runtime.services.my-service.outputs.some-key}\` and
        \`GARDEN_SERVICES_MY_SERVICE__OUTPUT_SOME_KEY\`).

        If no schema is provided, an error may be thrown if a service attempts to return an output.
      `),
    taskOutputsSchema: joi.object()
      .default(() => joi.object().keys({}), "{}")
      .description(dedent`
        A valid Joi schema describing the keys that each task outputs at runtime, for use in template strings
        and environment variables (e.g. \`\${runtime.tasks.my-task.outputs.some-key}\` and
        \`GARDEN_TASKS_MY_TASK__OUTPUT_SOME_KEY\`).

        If no schema is provided, an error may be thrown if a task attempts to return an output.
      `),
    title: joi.string()
      .description(
        "Readable title for the module type. Defaults to the title-cased type name, with dashes replaced by spaces.",
      ),
  })

export const pluginSchema = joi.object()
  .keys({
    name: joiIdentifier()
      .required()
      .description("The name of the plugin."),
    base: joiIdentifier()
      .description(dedent`
        Name of a plugin to use as a base for this plugin. If
      `),
    dependencies: joiArray(joi.string())
      .description(deline`
        Names of plugins that need to be configured prior to this plugin. This plugin will be able to reference the
        configuration from the listed plugins. Note that the dependencies will not be implicitly configured—the user
        will need to explicitly configure them in their project configuration.
      `),

    // TODO: make this a JSON/OpenAPI schema for portability
    configSchema: joi.object({ isJoi: joi.boolean().only(true).required() }).unknown(true),
    outputsSchema: joi.object({ isJoi: joi.boolean().only(true).required() }).unknown(true),

    handlers: joi.object().keys(mapValues(pluginActionDescriptions, () => joi.func()))
      .description("A map of plugin action handlers provided by the plugin."),
    commands: joi.array().items(pluginCommandSchema)
      .unique("name")
      .description("List of commands that this plugin exposes (via \`garden plugins <plugin name>\`"),
    createModuleTypes: joi.array().items(createModuleTypeSchema)
      .unique("name")
      .description("List of module types to create."),
    extendModuleTypes: joi.array().items(extendModuleTypeSchema)
      .unique("name")
      .description("List of module types to extend/override with additional handlers."),
  })
  .description("The schema for Garden plugins.")

export const pluginModuleSchema = joi.object()
  .keys({
    name: joiIdentifier(),
    gardenPlugin: joi.func().required()
      .description("The initialization function for the plugin. Should return a valid Garden plugin object."),
  })
  .unknown(true)
  .description("A module containing a Garden plugin.")

// This doesn't do much at the moment, but it makes sense to make this an SDK function to make it more future-proof
export function createGardenPlugin(spec: (GardenPluginSpec | (() => GardenPluginSpec))): GardenPlugin {
  return typeof spec === "function" ? spec() : spec
}
