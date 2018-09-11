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
import { serviceOutputsSchema } from "../../config/service"
import { LogNode } from "../../logger/logger"
import { Provider } from "../../config/project"
import {
  prepareEnvironmentParamsSchema,
  cleanupEnvironmentParamsSchema,
  getSecretParamsSchema,
  setSecretParamsSchema,
  deleteSecretParamsSchema,
  getLoginStatusParamsSchema,
  loginParamsSchema,
  logoutParamsSchema,
  getServiceStatusParamsSchema,
  deployServiceParamsSchema,
  deleteServiceParamsSchema,
  getServiceOutputsParamsSchema,
  execInServiceParamsSchema,
  getServiceLogsParamsSchema,
  runServiceParamsSchema,
  describeModuleTypeParamsSchema,
  validateModuleParamsSchema,
  getBuildStatusParamsSchema,
  buildModuleParamsSchema,
  pushModuleParamsSchema,
  runModuleParamsSchema,
  testModuleParamsSchema,
  getTestResultParamsSchema,
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
  loginStatusSchema,
  ModuleActionOutputs,
  moduleTypeDescriptionSchema,
  PluginActionOutputs,
  pushModuleResultSchema,
  runResultSchema,
  ServiceActionOutputs,
  setSecretResultSchema,
  testResultSchema,
  validateModuleResultSchema,
} from "./outputs"
import {
  ModuleActionParams,
  PluginActionParams,
  ServiceActionParams,
  getEnvironmentStatusParamsSchema,
} from "./params"

export type PluginActions = {
  [P in keyof PluginActionParams]: (params: PluginActionParams[P]) => PluginActionOutputs[P]
}

export type ServiceActions<T extends Module = Module> = {
  [P in keyof ServiceActionParams<T>]: (params: ServiceActionParams<T>[P]) => ServiceActionOutputs[P]
}

export type ModuleActions<T extends Module = Module> = {
  [P in keyof ModuleActionParams<T>]: (params: ModuleActionParams<T>[P]) => ModuleActionOutputs[P]
}

export type ModuleAndServiceActions<T extends Module = Module> = ModuleActions<T> & ServiceActions<T>

export type PluginActionName = keyof PluginActions
export type ServiceActionName = keyof ServiceActions
export type ModuleActionName = keyof ModuleActions

export interface PluginActionDescription {
  description: string
  paramsSchema: Joi.Schema
  resultSchema: Joi.Schema
}

export const pluginActionDescriptions: { [P in PluginActionName]: PluginActionDescription } = {
  getEnvironmentStatus: {
    description: dedent`
      Check if the current environment is ready for use by this plugin. Use this action in combination
      with \`prepareEnvironment\` to avoid unnecessary work on startup.

      Called before \`prepareEnvironment\`. If this returns \`{ ready: true }\`, the
      \`prepareEnvironment\` action is not called.
    `,
    paramsSchema: getEnvironmentStatusParamsSchema,
    resultSchema: environmentStatusSchema,
  },
  prepareEnvironment: {
    description: dedent`
      Make sure the environment is set up for this plugin. Use this action to do any bootstrapping required
      before deploying services.

      Called ahead of any service runtime actions (such as \`deployService\`,
      \`runModule\` and \`testModule\`), unless \`getEnvironmentStatus\` returns \`{ ready: true }\`.
    `,
    paramsSchema: prepareEnvironmentParamsSchema,
    resultSchema: prepareEnvironmentResultSchema,
  },
  cleanupEnvironment: {
    description: dedent`
      Clean up any runtime components, services etc. that this plugin has deployed in the environment.

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

  getLoginStatus: {
    description: dedent`
      Check if the user needs to log in for the current environment. Use this in combination with
      \`login\` if the plugin requires some form of authentication or identification before use.

      Called before \`login\`, if a \`login\` handler is specified. If this returns \`{ loggedIn: true }\`,
      the \`login\` action is not performed.
    `,
    paramsSchema: getLoginStatusParamsSchema,
    resultSchema: loginStatusSchema,
  },
  login: {
    description: dedent`
      Execute an authentication flow needed before using this plugin in the current environment.

      Unlike other action handlers, any configured \`login\` handlers are called synchronously and sequentially,
      so the handler can, for example, trigger external authentication flows, request input from stdin or call
      other CLIs that have a sequential flow requiring user input.

      Called by the \`garden login\` command.
    `,
    paramsSchema: loginParamsSchema,
    resultSchema: loginStatusSchema,
  },
  logout: {
    description: dedent`
      Clear any authentication previously performed for this plugin in the current environment.

      Called by the \`garden login\` command.
    `,
    paramsSchema: logoutParamsSchema,
    resultSchema: loginStatusSchema,
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
  deleteService: {
    description: dedent`
      Terminate a deployed service. This should wait until the service is no longer running.

      Called by the \`garden delete service\` command.
    `,
    paramsSchema: deleteServiceParamsSchema,
    resultSchema: serviceStatusSchema,
  },
  getServiceOutputs: {
    description: "DEPRECATED",
    paramsSchema: getServiceOutputsParamsSchema,
    resultSchema: serviceOutputsSchema,
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

export const moduleActionDescriptions: { [P in ModuleActionName | ServiceActionName]: PluginActionDescription } = {
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
    `,
    paramsSchema: describeModuleTypeParamsSchema,
    resultSchema: moduleTypeDescriptionSchema,
  },
  validate: {
    description: dedent`
      Validate and optionally transform the given module configuration.

      Note that this does not need to perform structural schema validation (the framework does that
      automatically), but should in turn perform semantic validation to make sure the configuration is sane.

      This can and should also be used to further specify the semantics of the module, including service
      configuration and test configuration. Since services and tests are not specified using built-in
      framework configuration fields, this action needs to specify those via the \`serviceConfigs\` and
      \`testConfigs\` output keys.
    `,
    paramsSchema: validateModuleParamsSchema,
    resultSchema: validateModuleResultSchema,
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
    `,
    paramsSchema: buildModuleParamsSchema,
    resultSchema: buildModuleResultSchema,
  },

  pushModule: {
    description: dedent`
      Push the build for current version of a module to a remote, such as a registry or an artifact store.
    `,
    paramsSchema: pushModuleParamsSchema,
    resultSchema: pushModuleResultSchema,
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
}

export const pluginActionNames: PluginActionName[] = <PluginActionName[]>Object.keys(pluginActionDescriptions)
export const serviceActionNames: ServiceActionName[] = <ServiceActionName[]>Object.keys(serviceActionDescriptions)
export const moduleActionNames: ModuleActionName[] = <ModuleActionName[]>Object.keys(moduleActionDescriptions)

export interface GardenPlugin {
  config?: object
  configKeys?: string[]

  modules?: string[]

  actions?: Partial<PluginActions>
  moduleActions?: { [moduleType: string]: Partial<ModuleAndServiceActions> }
}

export interface PluginFactoryParams<T extends Provider = any> {
  config: T["config"],
  logEntry: LogNode,
  projectName: string,
}

export interface PluginFactory<T extends Provider = any> {
  (params: PluginFactoryParams<T>): GardenPlugin | Promise<GardenPlugin>
  pluginName?: string
}
export type RegisterPluginParam = string | PluginFactory

export const pluginSchema = Joi.object()
  .keys({
    config: Joi.object()
      .meta({ extendable: true })
      .description(
        "Plugins may use this key to override or augment their configuration " +
        "(as specified in the garden.yml provider configuration.",
      ),
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
