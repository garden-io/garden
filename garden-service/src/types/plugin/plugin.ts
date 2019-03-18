/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { mapValues } from "lodash"
import dedent = require("dedent")
import {
  joiArray,
  joiIdentifier,
  joiIdentifierMap,
} from "../../config/common"
import { Module } from "../module"
import { serviceStatusSchema } from "../service"
import { LogNode } from "../../logger/log-node"
import {
  ModuleActionParams,
  PluginActionParams,
  ServiceActionParams,
  TaskActionParams,
  getEnvironmentStatusParamsSchema,
  prepareEnvironmentParamsSchema,
  cleanupEnvironmentParamsSchema,
  getSecretParamsSchema,
  setSecretParamsSchema,
  deleteSecretParamsSchema,
  getServiceStatusParamsSchema,
  deployServiceParamsSchema,
  deleteServiceParamsSchema,
  execInServiceParamsSchema,
  getServiceLogsParamsSchema,
  runServiceParamsSchema,
  describeModuleTypeParamsSchema,
  configureModuleParamsSchema,
  getBuildStatusParamsSchema,
  buildModuleParamsSchema,
  pushModuleParamsSchema,
  hotReloadServiceParamsSchema,
  runModuleParamsSchema,
  testModuleParamsSchema,
  getTestResultParamsSchema,
  publishModuleParamsSchema,
  getTaskResultParamsSchema,
  runTaskParamsSchema,
  configureProviderParamsSchema,
} from "./params"
import {
  buildModuleResultSchema,
  buildStatusSchema,
  prepareEnvironmentResultSchema,
  deleteSecretResultSchema,
  cleanupEnvironmentResultSchema,
  environmentStatusSchema,
  execInServiceResultSchema,
  getSecretResultSchema,
  getServiceLogsResultSchema,
  getTestResultSchema,
  ModuleActionOutputs,
  moduleTypeDescriptionSchema,
  PluginActionOutputs,
  pushModuleResultSchema,
  hotReloadServiceResultSchema,
  runResultSchema,
  ServiceActionOutputs,
  TaskActionOutputs,
  setSecretResultSchema,
  testResultSchema,
  configureModuleResultSchema,
  publishModuleResultSchema,
  runTaskResultSchema,
  getTaskResultSchema,
  configureProviderResultSchema,
} from "./outputs"

export type PluginActions = {
  [P in keyof PluginActionParams]: (params: PluginActionParams[P]) => PluginActionOutputs[P]
}

export type ServiceActions<T extends Module = Module> = {
  [P in keyof ServiceActionParams<T>]: (params: ServiceActionParams<T>[P]) => ServiceActionOutputs[P]
}

export type TaskActions<T extends Module = Module> = {
  [P in keyof TaskActionParams<T>]: (params: TaskActionParams<T>[P]) => TaskActionOutputs[P]
}

export type ModuleActions<T extends Module = Module> = {
  [P in keyof ModuleActionParams<T>]: (params: ModuleActionParams<T>[P]) => ModuleActionOutputs[P]
}

export type ModuleAndRuntimeActions<T extends Module = Module> =
  ModuleActions<T> & ServiceActions<T> & TaskActions<T>

export type PluginActionName = keyof PluginActions
export type ServiceActionName = keyof ServiceActions
export type TaskActionName = keyof TaskActions
export type ModuleActionName = keyof ModuleActions

export interface PluginActionDescription {
  description: string
  paramsSchema: Joi.Schema
  resultSchema: Joi.Schema
}

export const pluginActionDescriptions: { [P in PluginActionName]: PluginActionDescription } = {
  configureProvider: {
    description: dedent`
      Validate and transform the given provider configuration.

      Note that this does not need to perform structural schema validation (the framework does that
      automatically), but should in turn perform semantic validation to make sure the configuration is sane.

      This can also be used to further specify the semantics of the provider, including dependencies.

      Important: This action is called on most executions of Garden commands, so it should return quickly
      and avoid performing expensive processing or network calls.
    `,
    paramsSchema: configureProviderParamsSchema,
    resultSchema: configureProviderResultSchema,
  },
  getEnvironmentStatus: {
    description: dedent`
      Check if the current environment is ready for use by this plugin. Use this action in combination
      with \`prepareEnvironment\`.

      Called before \`prepareEnvironment\`. If this returns \`ready: true\`, the
      \`prepareEnvironment\` action is not called.

      If this returns \`needUserInput: true\`, the process may throw an error and guide the user to
      run \`garden init\`, so that \`prepareEnvironment\` can safely ask for user input. Otherwise the
      \`prepareEnvironment\` handler may be run implicitly ahead of actions like \`deployService\`,
      \`runModule\` etc.
    `,
    paramsSchema: getEnvironmentStatusParamsSchema,
    resultSchema: environmentStatusSchema,
  },
  prepareEnvironment: {
    description: dedent`
      Make sure the environment is set up for this plugin. Use this action to do any bootstrapping required
      before deploying services.

      Called ahead of any service runtime actions (such as \`deployService\`,
      \`runModule\` and \`testModule\`), unless \`getEnvironmentStatus\` returns \`ready: true\` or
      \`needUserInput: true\`.

      Important: If your handler does require user input, please be sure to indicate that via the
      \`getEnvironmentStatus\` handler. If this provider's \`getEnvironmentStatus\` returns \`needUserInput: true\`,
      this is only called via the \`garden init\` command, so that the handler can safely request user input via
      the CLI.
    `,
    paramsSchema: prepareEnvironmentParamsSchema,
    resultSchema: prepareEnvironmentResultSchema,
  },
  cleanupEnvironment: {
    description: dedent`
      Clean up any runtime components, services etc. that this plugin has deployed in the environment.

      Like \`prepareEnvironment\`, this is executed sequentially, so handlers are allowed to request user input
      if necessary.

      Called by the \`garden delete environment\` command.
    `,
    paramsSchema: cleanupEnvironmentParamsSchema,
    resultSchema: cleanupEnvironmentResultSchema,
  },

  getSecret: {
    description: dedent`
      Retrieve a secret value for this plugin in the current environment (as set via \`setSecret\`).
    `,
    paramsSchema: getSecretParamsSchema,
    resultSchema: getSecretResultSchema,
  },
  setSecret: {
    description: dedent`
      Set a secret for this plugin in the current environment. These variables are
      not used by the Garden framework, but the plugin may expose them to services etc. at runtime
      (e.g. as environment variables or mounted in containers).
    `,
    paramsSchema: setSecretParamsSchema,
    resultSchema: setSecretResultSchema,
  },
  deleteSecret: {
    description: dedent`
      Remove a secret for this plugin in the current environment (as set via \`setSecret\`).
    `,
    paramsSchema: deleteSecretParamsSchema,
    resultSchema: deleteSecretResultSchema,
  },
}

export const serviceActionDescriptions: { [P in ServiceActionName]: PluginActionDescription } = {
  getServiceStatus: {
    description: dedent`
      Check and return the current runtime status of a service.

      Called ahead of any actions that expect a service to be running, as well as the
      \`garden get status\` command.
    `,
    paramsSchema: getServiceStatusParamsSchema,
    resultSchema: serviceStatusSchema,
  },
  deployService: {
    description: dedent`
      Deploy the specified service. This should wait until the service is ready and accessible,
      and fail if the service doesn't reach a ready state.

      Called by the \`garden deploy\` and \`garden dev\` commands.
    `,
    paramsSchema: deployServiceParamsSchema,
    resultSchema: serviceStatusSchema,
  },
  hotReloadService: {
    description: dedent`
      Synchronize changes directly into a running service, instead of doing a full redeploy.
    `,
    paramsSchema: hotReloadServiceParamsSchema,
    resultSchema: hotReloadServiceResultSchema,
  },
  deleteService: {
    description: dedent`
      Terminate a deployed service. This should wait until the service is no longer running.

      Called by the \`garden delete service\` command.
    `,
    paramsSchema: deleteServiceParamsSchema,
    resultSchema: serviceStatusSchema,
  },
  execInService: {
    description: dedent`
      Execute the specified command next to a running service, e.g. in a service container.

      Called by the \`garden exec\` command.
    `,
    paramsSchema: execInServiceParamsSchema,
    resultSchema: execInServiceResultSchema,
  },
  getServiceLogs: {
    description: dedent`
      Retrieve a stream of logs for the specified service, optionally waiting listening for new logs.

      Called by the \`garden logs\` command.
    `,
    paramsSchema: getServiceLogsParamsSchema,
    resultSchema: getServiceLogsResultSchema,
  },
  runService: {
    description: dedent`
      Run an ad-hoc instance of the specified service. This should wait until the service completes
      execution, and should ideally attach it to the terminal (i.e. pipe the output from the service
      to the console, as well as pipe the input from the console to the running service).

      Called by the \`garden run service\` command.
    `,
    paramsSchema: runServiceParamsSchema,
    resultSchema: runResultSchema,
  },
}

export const taskActionDescriptions: { [P in TaskActionName]: PluginActionDescription } = {
  // TODO: see if this is actually necessary or useful
  getTaskResult: {
    description: dedent`
      Retrieve the task result for the specified version. Use this along with the \`runTask\` handler
      to avoid running the same task repeatedly when its dependencies haven't changed.

      Note that the version string provided to this handler may be a hash of the module's version, as
      well as any runtime dependencies configured for the task, so it may not match the current version
      of the module itself.
    `,
    paramsSchema: getTaskResultParamsSchema,
    resultSchema: getTaskResultSchema,
  },
  runTask: {
    description: dedent`
      Runs a task within the context of its module. This should wait until execution completes, and
      return its output.
    `,
    paramsSchema: runTaskParamsSchema,
    resultSchema: runTaskResultSchema,
  },
}

export const moduleActionDescriptions:
  { [P in ModuleActionName | ServiceActionName | TaskActionName]: PluginActionDescription } = {
  // TODO: implement this method (it is currently not defined or used)
  describeType: {
    description: dedent`
      Return documentation and a schema description of the module type.

      The documentation should be in markdown format. A reference for the module type is automatically
      generated based on the provided schema, and a section appended to the provided documentation.

      The schema should be a valid OpenAPI schema describing the configuration keys that the user
      should use under the \`module\` key in a \`garden.yml\` configuration file. Note that the schema
      should not specify the built-in fields (such as \`name\`, \`type\` and \`description\`).

      Used when auto-generating framework documentation.

      This action is called on every execution of Garden, so it should return quickly and avoid doing
      any network calls.
    `,
    paramsSchema: describeModuleTypeParamsSchema,
    resultSchema: moduleTypeDescriptionSchema,
  },
  configure: {
    description: dedent`
      Validate and transform the given module configuration.

      Note that this does not need to perform structural schema validation (the framework does that
      automatically), but should in turn perform semantic validation to make sure the configuration is sane.

      This can and should also be used to further specify the semantics of the module, including service
      configuration and test configuration. Since services and tests are not specified using built-in
      framework configuration fields, this action needs to specify those via the \`serviceConfigs\` and
      \`testConfigs\` output keys.

      This action is called on every execution of Garden, so it should return quickly and avoid doing
      any network calls.
    `,
    paramsSchema: configureModuleParamsSchema,
    resultSchema: configureModuleResultSchema,
  },

  getBuildStatus: {
    description: dedent`
      Check and return the build status of a module, i.e. whether the current version been built.

      Called before running the \`build\` action, which is not run if this returns \`{ ready: true }\`.
    `,
    paramsSchema: getBuildStatusParamsSchema,
    resultSchema: buildStatusSchema,
  },
  build: {
    description: dedent`
      Build the current version of a module. This must wait until the build is complete before returning.

      Called ahead of a number of actions, including \`deployService\`, \`pushModule\` and \`publishModule\`.
    `,
    paramsSchema: buildModuleParamsSchema,
    resultSchema: buildModuleResultSchema,
  },

  pushModule: {
    description: dedent`
      Push the build for current version of a module to the deployment environment, making it accessible
      to the development environment. An example being a container registry or artifact registry that's
      available to the deployment environment when deploying.

      Note the distinction to \`publishModule\` which may, depending on the module type, work similarly but
      is only called when explicitly calling the \`garden publish\`.

      This is usually not necessary for plugins that run locally.

      Called before the \`deployService\` action.
    `,
    paramsSchema: pushModuleParamsSchema,
    resultSchema: pushModuleResultSchema,
  },

  publishModule: {
    description: dedent`
      Publish a built module to a remote registry.

      Note the distinction to \`pushModule\` which may, depending on the module type, work similarly but
      is automatically called ahead of \`deployService\`.

      Called by the \`garden publish\` command.
    `,
    paramsSchema: publishModuleParamsSchema,
    resultSchema: publishModuleResultSchema,
  },

  runModule: {
    description: dedent`
      Run an ad-hoc instance of the specified module. This should wait until the execution completes,
      and should ideally attach it to the terminal (i.e. pipe the output from the service
      to the console, as well as pipe the input from the console to the running service).

      Called by the \`garden run module\` command.
    `,
    paramsSchema: runModuleParamsSchema,
    resultSchema: runResultSchema,
  },

  testModule: {
    description: dedent`
      Run the specified test for a module.

      This should complete the test run and return the logs from the test run, and signal whether the
      tests completed successfully.

      It should also store the test results and provide the accompanying \`getTestResult\` handler,
      so that the same version does not need to be tested multiple times.

      Note that the version string provided to this handler may be a hash of the module's version, as
      well as any runtime dependencies configured for the test, so it may not match the current version
      of the module itself.
    `,
    paramsSchema: testModuleParamsSchema,
    resultSchema: testResultSchema,
  },
  getTestResult: {
    description: dedent`
      Retrieve the test result for the specified version. Use this along with the \`testModule\` handler
      to avoid testing the same code repeatedly.

      Note that the version string provided to this handler may be a hash of the module's version, as
      well as any runtime dependencies configured for the test, so it may not match the current version
      of the module itself.
    `,
    paramsSchema: getTestResultParamsSchema,
    resultSchema: getTestResultSchema,
  },

  ...serviceActionDescriptions,

  ...taskActionDescriptions,
}

export const pluginActionNames: PluginActionName[] = <PluginActionName[]>Object.keys(pluginActionDescriptions)
export const moduleActionNames: ModuleActionName[] = <ModuleActionName[]>Object.keys(moduleActionDescriptions)

export interface GardenPlugin {
  configSchema?: Joi.Schema,
  configKeys?: string[]

  modules?: string[]

  actions?: Partial<PluginActions>
  moduleActions?: { [moduleType: string]: Partial<ModuleAndRuntimeActions> }
}

export interface PluginFactoryParams {
  log: LogNode,
  projectName: string,
}

export interface PluginFactory {
  (params: PluginFactoryParams): GardenPlugin | Promise<GardenPlugin>
}
export type RegisterPluginParam = string | PluginFactory
export interface Plugins {
  [name: string]: RegisterPluginParam
}

export const pluginSchema = Joi.object()
  .keys({
    // TODO: make this an OpenAPI schema for portability
    configSchema: Joi.object({ isJoi: Joi.boolean().only(true).required() }).unknown(true),
    modules: joiArray(Joi.string())
      .description(
        "Plugins may optionally provide paths to Garden modules that are loaded as part of the plugin. " +
        "This is useful, for example, to provide build dependencies for other modules " +
        "or as part of the plugin operation.",
      ),
    // TODO: document plugin actions further
    actions: Joi.object().keys(mapValues(pluginActionDescriptions, () => Joi.func()))
      .description("A map of plugin action handlers provided by the plugin."),
    moduleActions: joiIdentifierMap(
      Joi.object().keys(mapValues(moduleActionDescriptions, () => Joi.func()),
      ).description("A map of module names and module action handlers provided by the plugin."),
    ),
  })
  .description("The schema for Garden plugins.")

export const pluginModuleSchema = Joi.object()
  .keys({
    name: joiIdentifier(),
    gardenPlugin: Joi.func().required()
      .description("The initialization function for the plugin. Should return a valid Garden plugin object."),
  })
  .unknown(true)
  .description("A module containing a Garden plugin.")
