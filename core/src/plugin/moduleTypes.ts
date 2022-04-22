/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import { BuildModuleParams, BuildResult, build } from "../types/plugin/module/build"
import { BuildStatus, GetBuildStatusParams, getBuildStatus } from "../types/plugin/module/getBuildStatus"
import { ConfigureModuleParams, ConfigureModuleResult, configure } from "./handlers/module/configure"
import { DeleteServiceParams, deleteService } from "../types/plugin/service/deleteService"
import { DeployServiceParams, deployService } from "../types/plugin/service/deployService"
import { ExecInServiceParams, ExecInServiceResult, execInService } from "../types/plugin/service/execInService"
import { GetServiceLogsParams, getServiceLogs } from "../types/plugin/service/getServiceLogs"
import { GetServiceStatusParams, getServiceStatus } from "../types/plugin/service/getServiceStatus"
import { GetTaskResultParams, getTaskResult } from "../types/plugin/task/getTaskResult"
import { TestResult } from "../types/test"
import {
  HotReloadServiceParams,
  HotReloadServiceResult,
  hotReloadService,
} from "../types/plugin/service/hotReloadService"
import { PublishModuleParams, PublishModuleResult, publishModule } from "../types/plugin/module/publishModule"
import { RunModuleParams, runModule } from "../types/plugin/module/runModule"
import { RunServiceParams, runService } from "../types/plugin/service/runService"
import { RunTaskParams, RunTaskResult, runTask } from "../types/plugin/task/runTask"
import { TestModuleParams, testModule } from "../types/plugin/module/testModule"
import { joiIdentifier, joi, joiSchema } from "../config/common"
import { GardenModule } from "../types/module"
import { ActionHandlerParamsBase, PluginActionDescription, RunResult, WrappedActionHandler } from "./base"
import { ServiceStatus } from "../types/service"
import { mapValues } from "lodash"
import { dedent } from "../util/string"
import { getPortForward, GetPortForwardParams, GetPortForwardResult } from "../types/plugin/service/getPortForward"
import { StopPortForwardParams, stopPortForward } from "../types/plugin/service/stopPortForward"
import { suggestModules, SuggestModulesParams, SuggestModulesResult } from "../types/plugin/module/suggestModules"
import { templateStringLiteral } from "../docs/common"
import {
  getModuleOutputs,
  GetModuleOutputsParams,
  GetModuleOutputsResult,
} from "../types/plugin/module/getModuleOutputs"
import { getTestResult, GetTestResultParams } from "../types/plugin/module/getTestResult"
import { convertModule, ConvertModuleParams, ConvertModuleResult } from "./handlers/module/convert"
import { baseHandlerSchema } from "./handlers/base/base"
import { PluginActionDescriptions } from "./plugin"

export type ModuleActionHandler<P extends ActionHandlerParamsBase, O> = ((params: P) => Promise<O>) & {
  actionType?: string
  pluginName?: string
  moduleType?: string
  base?: ModuleActionHandler<P, O>
}

export type WrappedModuleActionHandler<P extends ActionHandlerParamsBase, O> = WrappedActionHandler<P, O> & {
  moduleType: string
  base?: WrappedModuleActionHandler<P, O>
}

export type ModuleActionHandlers<T extends GardenModule = GardenModule> = {
  [P in keyof ModuleActionParams<T>]: ModuleActionHandler<ModuleActionParams<T>[P], ModuleActionOutputs[P]>
}

export type ServiceActionHandlers<T extends GardenModule = GardenModule> = {
  [P in keyof ServiceActionParams<T>]: ModuleActionHandler<ServiceActionParams<T>[P], ServiceActionOutputs[P]>
}

export type TaskActionHandlers<T extends GardenModule = GardenModule> = {
  [P in keyof TaskActionParams<T>]: ModuleActionHandler<TaskActionParams<T>[P], TaskActionOutputs[P]>
}

export type ModuleAndRuntimeActionHandlers<T extends GardenModule = GardenModule> = ModuleActionHandlers<T> &
  ServiceActionHandlers<T> &
  TaskActionHandlers<T>

// export type AllActionHandlers<T extends GardenModule = GardenModule> = PluginActionHandlers &
//   ModuleAndRuntimeActionHandlers<T>

export type ServiceActionName = keyof ServiceActionParams
export type TaskActionName = keyof TaskActionParams
export type ModuleActionName = keyof ModuleActionParams

interface _ServiceActionParams<T extends GardenModule = GardenModule> {
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
export type ServiceActionParams<T extends GardenModule = GardenModule> = {
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

interface _TaskActionParams<T extends GardenModule = GardenModule> {
  getTaskResult: GetTaskResultParams<T>
  runTask: RunTaskParams<T>
}

// Specify base parameter more precisely than the base schema
export type TaskActionParams<T extends GardenModule = GardenModule> = {
  [P in keyof _TaskActionParams<T>]: _TaskActionParams<T>[P] & {
    base?: WrappedModuleActionHandler<_TaskActionParams<T>[P], TaskActionOutputs[P]>
  }
}

export interface TaskActionOutputs {
  runTask: RunTaskResult
  getTaskResult: RunTaskResult | null | undefined
}

const taskActionDescriptions: { [P in TaskActionName]: () => PluginActionDescription } = {
  getTaskResult,
  runTask,
}

interface _ModuleActionParams<T extends GardenModule = GardenModule> {
  configure: ConfigureModuleParams<T>
  convert: ConvertModuleParams<T>
  suggestModules: SuggestModulesParams
  getBuildStatus: GetBuildStatusParams<T>
  build: BuildModuleParams<T>
  publish: PublishModuleParams<T>
  runModule: RunModuleParams<T>
  testModule: TestModuleParams<T>
  getTestResult: GetTestResultParams<T>
  getModuleOutputs: GetModuleOutputsParams<T>
}

// Specify base parameter more precisely than the base schema
export type ModuleActionParams<T extends GardenModule = GardenModule> = {
  [P in keyof _ModuleActionParams<T>]: _ModuleActionParams<T>[P] & {
    base?: WrappedModuleActionHandler<_ModuleActionParams<T>[P], ModuleActionOutputs[P]>
  }
}

export type ModuleAndRuntimeActionParams<T extends GardenModule = GardenModule> = ModuleActionParams<T> &
  ServiceActionParams<T> &
  TaskActionParams<T>

export type ModuleAndRuntimeActionOutputs = ModuleActionOutputs & ServiceActionOutputs & TaskActionOutputs

export interface ModuleActionOutputs extends ServiceActionOutputs {
  configure: ConfigureModuleResult
  convert: ConvertModuleResult
  suggestModules: SuggestModulesResult
  getBuildStatus: BuildStatus
  build: BuildResult
  publish: PublishModuleResult
  runModule: RunResult
  testModule: TestResult
  getTestResult: TestResult | null
  getModuleOutputs: GetModuleOutputsResult
}

// It takes a short while to resolve all these schemas, so we cache the result
let _moduleActionDescriptions: PluginActionDescriptions

export function getModuleActionDescriptions(): PluginActionDescriptions {
  if (_moduleActionDescriptions) {
    return _moduleActionDescriptions
  }

  const descriptions = {
    configure,
    convertModule,
    getModuleOutputs,
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

export function getModuleActionNames() {
  return <ModuleActionName[]>Object.keys(getModuleActionDescriptions())
}

export interface ModuleTypeExtension<M extends GardenModule = GardenModule> {
  // Note: This needs to be this verbose because of issues with the TS compiler
  handlers: {
    [T in keyof ModuleAndRuntimeActionParams<M>]?: ((
      params: ModuleAndRuntimeActionParams<M>[T]
    ) => Promise<ModuleAndRuntimeActionOutputs[T]>) & {
      actionType?: string
      pluginName?: string
      moduleType?: string
      base?: ModuleAndRuntimeActionHandlers[T]
    }
  }
  name: string
}

export interface ModuleTypeDefinition<T extends GardenModule = GardenModule> extends ModuleTypeExtension<T> {
  base?: string
  docs: string
  // TODO: specify the schemas using primitives (e.g. JSONSchema/OpenAPI) and not Joi objects
  moduleOutputsSchema?: Joi.ObjectSchema
  schema?: Joi.ObjectSchema
  serviceOutputsSchema?: Joi.ObjectSchema
  taskOutputsSchema?: Joi.ObjectSchema
  title?: string
}

export const moduleHandlersSchema = () =>
  joi
    .object()
    .keys(mapValues(getModuleActionDescriptions(), () => joi.func()))
    .description("A map of module action handlers provided by the plugin.")

export const extendModuleTypeSchema = () =>
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

export const createModuleTypeSchema = () =>
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
