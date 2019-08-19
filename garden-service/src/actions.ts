/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")

import chalk from "chalk"
import { fromPairs, mapValues, omit, pickBy } from "lodash"

import { PublishModuleParams, PublishResult } from "./types/plugin/module/publishModule"
import { SetSecretParams, SetSecretResult } from "./types/plugin/provider/setSecret"
import { validate, joi } from "./config/common"
import { defaultProvider } from "./config/provider"
import { ParameterError, PluginError, ConfigurationError } from "./exceptions"
import { ActionHandlerMap, Garden, ModuleActionHandlerMap, ModuleActionMap, PluginActionMap } from "./garden"
import { LogEntry } from "./logger/log-entry"
import { ProcessResults, processServices } from "./process"
import { getDependantTasksForModule } from "./tasks/helpers"
import { Module } from "./types/module"
import {
  PluginActionContextParams,
  PluginActionParamsBase,
  PluginModuleActionParamsBase,
  PluginServiceActionParamsBase,
  PluginTaskActionParamsBase,
  RunResult,
} from "./types/plugin/base"
import { BuildModuleParams, BuildResult } from "./types/plugin/module/build"
import { BuildStatus, GetBuildStatusParams } from "./types/plugin/module/getBuildStatus"
import { GetTestResultParams, TestResult } from "./types/plugin/module/getTestResult"
import { RunModuleParams } from "./types/plugin/module/runModule"
import { TestModuleParams } from "./types/plugin/module/testModule"
import {
  ModuleActionOutputs,
  ModuleActionParams,
  ModuleActions,
  ModuleAndRuntimeActions,
  PluginActionOutputs,
  PluginActionParams,
  PluginActions,
  ServiceActionOutputs,
  ServiceActionParams,
  ServiceActions,
  TaskActionOutputs,
  TaskActionParams,
  TaskActions,
  moduleActionDescriptions,
  moduleActionNames,
  pluginActionDescriptions,
  pluginActionNames,
  GardenPlugin,
} from "./types/plugin/plugin"
import { CleanupEnvironmentParams } from "./types/plugin/provider/cleanupEnvironment"
import { DeleteSecretParams, DeleteSecretResult } from "./types/plugin/provider/deleteSecret"
import {
  EnvironmentStatusMap,
  GetEnvironmentStatusParams,
  EnvironmentStatus,
} from "./types/plugin/provider/getEnvironmentStatus"
import { GetSecretParams, GetSecretResult } from "./types/plugin/provider/getSecret"
import { DeleteServiceParams } from "./types/plugin/service/deleteService"
import { DeployServiceParams } from "./types/plugin/service/deployService"
import { ExecInServiceParams, ExecInServiceResult } from "./types/plugin/service/execInService"
import { GetServiceLogsParams, GetServiceLogsResult } from "./types/plugin/service/getServiceLogs"
import { GetServiceStatusParams } from "./types/plugin/service/getServiceStatus"
import { HotReloadServiceParams, HotReloadServiceResult } from "./types/plugin/service/hotReloadService"
import { RunServiceParams } from "./types/plugin/service/runService"
import { GetTaskResultParams } from "./types/plugin/task/getTaskResult"
import { RunTaskParams, RunTaskResult } from "./types/plugin/task/runTask"
import { ServiceStatus, ServiceStatusMap } from "./types/service"
import { Omit } from "./util/util"
import { DebugInfoMap } from "./types/plugin/provider/getDebugInfo"
import { PrepareEnvironmentParams, PrepareEnvironmentResult } from "./types/plugin/provider/prepareEnvironment"
import { GetPortForwardParams } from "./types/plugin/service/getPortForward"
import { StopPortForwardParams } from "./types/plugin/service/stopPortForward"
import { emptyRuntimeContext, RuntimeContext } from "./runtime-context"
import { GetServiceStatusTask } from "./tasks/get-service-status"
import { getServiceStatuses } from "./tasks/base"
import { getRuntimeTemplateReferences } from "./template-string"

type TypeGuard = {
  readonly [P in keyof (PluginActionParams | ModuleActionParams<any>)]: (...args: any[]) => Promise<any>
}

export interface AllEnvironmentStatus {
  providers: EnvironmentStatusMap
  services: { [name: string]: ServiceStatus }
}

export interface DeployServicesParams {
  log: LogEntry
  serviceNames?: string[]
  force?: boolean
  forceBuild?: boolean
}

// avoid having to specify common params on each action helper call
type ActionHelperParams<T extends PluginActionParamsBase> =
  Omit<T, keyof PluginActionContextParams> & { pluginName?: string }

type ModuleActionHelperParams<T extends PluginModuleActionParamsBase> =
  Omit<T, keyof PluginActionContextParams> & { pluginName?: string }
// additionally make runtimeContext param optional

type ServiceActionHelperParams<T extends PluginServiceActionParamsBase> =
  Omit<T, "module" | keyof PluginActionContextParams>
  & { pluginName?: string }

type TaskActionHelperParams<T extends PluginTaskActionParamsBase> =
  Omit<T, "module" | keyof PluginActionContextParams>
  & { pluginName?: string }

type RequirePluginName<T> = T & { pluginName: string }

export class ActionHelper implements TypeGuard {
  private readonly actionHandlers: PluginActionMap
  private readonly moduleActionHandlers: ModuleActionMap

  constructor(private garden: Garden, plugins: { [key: string]: GardenPlugin }) {
    this.actionHandlers = <PluginActionMap>fromPairs(pluginActionNames.map(n => [n, {}]))
    this.moduleActionHandlers = <ModuleActionMap>fromPairs(moduleActionNames.map(n => [n, {}]))

    for (const [name, plugin] of Object.entries(plugins)) {
      const actions = plugin.actions || {}

      for (const actionType of pluginActionNames) {
        const handler = actions[actionType]
        handler && this.addActionHandler(name, plugin, actionType, handler)
      }

      const moduleActions = plugin.moduleActions || {}

      for (const moduleType of Object.keys(moduleActions)) {
        for (const actionType of moduleActionNames) {
          const handler = moduleActions[moduleType][actionType]
          handler && this.addModuleActionHandler(name, plugin, actionType, moduleType, handler)
        }
      }
    }
  }

  //===========================================================================
  //region Environment Actions
  //===========================================================================

  async getEnvironmentStatus(
    params: RequirePluginName<ActionHelperParams<GetEnvironmentStatusParams>>,
  ): Promise<EnvironmentStatus> {
    const { pluginName } = params

    return this.callActionHandler({
      actionType: "getEnvironmentStatus",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({ ready: true, outputs: {} }),
    })
  }

  async prepareEnvironment(
    params: RequirePluginName<ActionHelperParams<PrepareEnvironmentParams>>,
  ): Promise<PrepareEnvironmentResult> {
    const { pluginName } = params

    return this.callActionHandler({
      actionType: "prepareEnvironment",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({ status: { ready: true, outputs: {} } }),
    })
  }

  async cleanupEnvironment(
    params: RequirePluginName<ActionHelperParams<CleanupEnvironmentParams>>,
  ) {
    const { pluginName } = params
    return this.callActionHandler({
      actionType: "cleanupEnvironment",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({}),
    })
  }

  async getSecret(params: RequirePluginName<ActionHelperParams<GetSecretParams>>): Promise<GetSecretResult> {
    const { pluginName } = params
    return this.callActionHandler({ actionType: "getSecret", pluginName, params: omit(params, ["pluginName"]) })
  }

  async setSecret(params: RequirePluginName<ActionHelperParams<SetSecretParams>>): Promise<SetSecretResult> {
    const { pluginName } = params
    return this.callActionHandler({ actionType: "setSecret", pluginName, params: omit(params, ["pluginName"]) })
  }

  async deleteSecret(params: RequirePluginName<ActionHelperParams<DeleteSecretParams>>): Promise<DeleteSecretResult> {
    const { pluginName } = params
    return this.callActionHandler({ actionType: "deleteSecret", pluginName, params: omit(params, ["pluginName"]) })
  }

  //endregion

  //===========================================================================
  //region Module Actions
  //===========================================================================

  async describeType(moduleType: string) {
    const handler = await this.getModuleActionHandler({
      actionType: "describeType",
      moduleType,
      defaultHandler: async ({ }) => ({
        docs: "",
        moduleOutputsSchema: joi.object().options({ allowUnknown: true }),
        schema: joi.object().options({ allowUnknown: true }),
      }),
    })

    return handler({})
  }

  async getBuildStatus<T extends Module>(
    params: ModuleActionHelperParams<GetBuildStatusParams<T>>,
  ): Promise<BuildStatus> {
    return this.callModuleHandler({
      params,
      actionType: "getBuildStatus",
      defaultHandler: async () => ({ ready: false }),
    })
  }

  async build<T extends Module>(params: ModuleActionHelperParams<BuildModuleParams<T>>): Promise<BuildResult> {
    return this.callModuleHandler({ params, actionType: "build" })
  }

  async publishModule<T extends Module>(
    params: ModuleActionHelperParams<PublishModuleParams<T>>,
  ): Promise<PublishResult> {
    return this.callModuleHandler({ params, actionType: "publish", defaultHandler: dummyPublishHandler })
  }

  async runModule<T extends Module>(params: ModuleActionHelperParams<RunModuleParams<T>>): Promise<RunResult> {
    return this.callModuleHandler({ params, actionType: "runModule" })
  }

  async testModule<T extends Module>(params: ModuleActionHelperParams<TestModuleParams<T>>): Promise<TestResult> {
    return this.callModuleHandler({ params, actionType: "testModule" })
  }

  async getTestResult<T extends Module>(
    params: ModuleActionHelperParams<GetTestResultParams<T>>,
  ): Promise<TestResult | null> {
    return this.callModuleHandler({
      params,
      actionType: "getTestResult",
      defaultHandler: async () => null,
    })
  }

  //endregion

  //===========================================================================
  //region Service Actions
  //===========================================================================

  async getServiceStatus(params: ServiceActionHelperParams<GetServiceStatusParams>): Promise<ServiceStatus> {
    return this.callServiceHandler({ params, actionType: "getServiceStatus" })
  }

  async deployService(params: ServiceActionHelperParams<DeployServiceParams>): Promise<ServiceStatus> {
    return this.callServiceHandler({ params, actionType: "deployService" })
  }

  async hotReloadService(params: ServiceActionHelperParams<HotReloadServiceParams>)
    : Promise<HotReloadServiceResult> {
    return this.callServiceHandler(({ params, actionType: "hotReloadService" }))
  }

  async deleteService(params: ServiceActionHelperParams<DeleteServiceParams>): Promise<ServiceStatus> {
    const log = params.log.info({
      section: params.service.name,
      msg: "Deleting...",
      status: "active",
    })

    const runtimeContext = emptyRuntimeContext
    const status = await this.getServiceStatus({ ...params, runtimeContext, hotReload: false })

    if (status.state === "missing") {
      log.setSuccess({
        section: params.service.name,
        msg: "Not found",
      })
      return status
    }

    const result = this.callServiceHandler({
      params: { ...params, log },
      actionType: "deleteService",
      defaultHandler: dummyDeleteServiceHandler,
    })

    log.setSuccess()

    return result
  }

  async execInService(params: ServiceActionHelperParams<ExecInServiceParams>): Promise<ExecInServiceResult> {
    return this.callServiceHandler({ params, actionType: "execInService" })
  }

  async getServiceLogs(params: ServiceActionHelperParams<GetServiceLogsParams>): Promise<GetServiceLogsResult> {
    return this.callServiceHandler({ params, actionType: "getServiceLogs", defaultHandler: dummyLogStreamer })
  }

  async runService(params: ServiceActionHelperParams<RunServiceParams>): Promise<RunResult> {
    return this.callServiceHandler({ params, actionType: "runService" })
  }

  async getPortForward(params: ServiceActionHelperParams<GetPortForwardParams>) {
    return this.callServiceHandler({ params, actionType: "getPortForward" })
  }

  async stopPortForward(params: ServiceActionHelperParams<StopPortForwardParams>) {
    return this.callServiceHandler({ params, actionType: "stopPortForward" })
  }

  //endregion

  //===========================================================================
  //region Task Methods
  //===========================================================================

  async runTask(params: TaskActionHelperParams<RunTaskParams>): Promise<RunTaskResult> {
    return this.callTaskHandler({ params, actionType: "runTask" })
  }

  async getTaskResult(params: TaskActionHelperParams<GetTaskResultParams>): Promise<RunTaskResult | null> {
    return this.callTaskHandler({
      params,
      actionType: "getTaskResult",
      defaultHandler: async () => null,
    })
  }

  //endregion

  //===========================================================================
  //region Helper Methods
  //===========================================================================

  async getStatus({ log, serviceNames }: { log: LogEntry, serviceNames?: string[] }): Promise<AllEnvironmentStatus> {
    log.verbose(`Getting environment status (${this.garden.projectName})`)

    const envStatus = await this.garden.getEnvironmentStatus()
    const serviceStatuses = await this.getServiceStatuses({ log, serviceNames })

    return {
      providers: envStatus,
      services: serviceStatuses,
    }
  }

  async getServiceStatuses(
    { log, serviceNames }: { log: LogEntry, serviceNames?: string[] },
  ): Promise<ServiceStatusMap> {
    const graph = await this.garden.getConfigGraph()
    const services = await graph.getServices(serviceNames)

    const tasks = services.map(service => new GetServiceStatusTask({
      force: false,
      garden: this.garden,
      graph,
      log,
      service,
    }))
    const results = await this.garden.processTasks(tasks)

    return getServiceStatuses(results)
  }

  async deployServices(
    { serviceNames, force = false, forceBuild = false, log }: DeployServicesParams,
  ): Promise<ProcessResults> {
    const graph = await this.garden.getConfigGraph()
    const services = await graph.getServices(serviceNames)

    return processServices({
      services,
      garden: this.garden,
      graph,
      log,
      watch: false,
      handler: async (_, module) => getDependantTasksForModule({
        garden: this.garden,
        log,
        graph,
        module,
        hotReloadServiceNames: [],
        force,
        forceBuild,
      }),
    })
  }

  /**
   * Deletes all services and cleans up the specified environment.
   */
  async deleteEnvironment(log: LogEntry) {
    const graph = await this.garden.getConfigGraph()

    const servicesLog = log.info({ msg: chalk.white("Deleting services..."), status: "active" })

    const services = await graph.getServices()
    const serviceStatuses: { [key: string]: ServiceStatus } = {}

    await Bluebird.map(services, async (service) => {
      serviceStatuses[service.name] = await this.deleteService({ log: servicesLog, service })
    })

    servicesLog.setSuccess()

    log.info("")

    const envLog = log.info({ msg: chalk.white("Cleaning up environments..."), status: "active" })
    const environmentStatuses: EnvironmentStatusMap = {}

    const providers = await this.garden.resolveProviders()
    await Bluebird.each(providers, async (provider) => {
      await this.cleanupEnvironment({ pluginName: provider.name, log: envLog })
      environmentStatuses[provider.name] = await this.getEnvironmentStatus({ pluginName: provider.name, log: envLog })
    })

    envLog.setSuccess()

    return { serviceStatuses, environmentStatuses }
  }

  async getDebugInfo({ log, includeProject }: { log: LogEntry, includeProject: boolean }): Promise<DebugInfoMap> {
    const handlers = await this.getActionHandlers("getDebugInfo")
    return Bluebird.props(mapValues(handlers, async (h) => h({ ...await this.commonParams(h, log), includeProject })))
  }

  //endregion

  // TODO: find a nicer way to do this (like a type-safe wrapper function)
  private async commonParams(handler, log: LogEntry): Promise<PluginActionParamsBase> {
    const provider = await this.garden.resolveProvider(handler["pluginName"])
    return {
      ctx: await this.garden.getPluginContext(provider),
      // TODO: find a better way for handlers to log during execution
      log,
    }
  }

  private async callActionHandler<T extends keyof Omit<PluginActions, "configureProvider">>(
    { params, actionType, pluginName, defaultHandler }:
      {
        params: ActionHelperParams<PluginActionParams[T]>,
        actionType: T,
        pluginName: string,
        defaultHandler?: PluginActions[T],
      },
  ): Promise<PluginActionOutputs[T]> {
    this.garden.log.silly(`Calling '${actionType}' handler on '${pluginName}'`)
    const handler = await this.getActionHandler({
      actionType,
      pluginName,
      defaultHandler,
    })
    const handlerParams: PluginActionParams[T] = {
      ...await this.commonParams(handler, (<any>params).log),
      ...<object>params,
    }
    const result = (<Function>handler)(handlerParams)
    this.garden.log.silly(`Called '${actionType}' handler on ${pluginName}'`)
    return result
  }

  private async callModuleHandler<T extends keyof Omit<ModuleActions, "describeType" | "configure">>(
    { params, actionType, defaultHandler }:
      { params: ModuleActionHelperParams<ModuleActionParams[T]>, actionType: T, defaultHandler?: ModuleActions[T] },
  ): Promise<ModuleActionOutputs[T]> {
    const { module, pluginName, log } = params

    log.verbose(`Getting ${actionType} handler for module ${module.name}`)

    const handler = await this.getModuleActionHandler({
      moduleType: module.type,
      actionType,
      pluginName,
      defaultHandler,
    })

    const handlerParams = {
      ...await this.commonParams(handler, (<any>params).log),
      ...<object>params,
      module: omit(module, ["_ConfigType"]),
    }

    log.verbose(`Calling ${actionType} handler for module ${module.name}`)

    // TODO: figure out why this doesn't compile without the function cast
    return (<Function>handler)(handlerParams)
  }

  private async callServiceHandler<T extends keyof ServiceActions>(
    { params, actionType, defaultHandler }:
      { params: ServiceActionHelperParams<ServiceActionParams[T]>, actionType: T, defaultHandler?: ServiceActions[T] },
  ): Promise<ServiceActionOutputs[T]> {
    let { log, service, runtimeContext } = params
    let module = omit(service.module, ["_ConfigType"])

    log.verbose(`Getting ${actionType} handler for service ${service.name}`)

    const handler = await this.getModuleActionHandler({
      moduleType: module.type,
      actionType,
      pluginName: params.pluginName,
      defaultHandler,
    })

    // Resolve ${runtime.*} template strings if needed.
    if (runtimeContext && (await getRuntimeTemplateReferences(module)).length > 0) {
      log.verbose(`Resolving runtime template strings for service '${service.name}'`)
      const configContext = await this.garden.getModuleConfigContext(runtimeContext)
      const graph = await this.garden.getConfigGraph({ configContext })
      service = await graph.getService(service.name)
      module = service.module

      // Make sure everything has been resolved in the task config
      const remainingRefs = await getRuntimeTemplateReferences(service.config)
      if (remainingRefs.length > 0) {
        const unresolvedStrings = remainingRefs.map(ref => `\${${ref.join(".")}}`).join(", ")
        throw new ConfigurationError(
          `Unable to resolve one or more runtime template values for service '${service.name}': ${unresolvedStrings}`,
          { service, unresolvedStrings },
        )
      }
    }

    const handlerParams = {
      ...await this.commonParams(handler, log),
      ...params,
      module,
      runtimeContext,
    }

    log.verbose(`Calling ${actionType} handler for service ${service.name}`)

    return (<Function>handler)(handlerParams)
  }

  private async callTaskHandler<T extends keyof TaskActions>(
    { params, actionType, defaultHandler }:
      {
        params: TaskActionHelperParams<TaskActionParams[T]>, actionType: T,
        defaultHandler?: TaskActions[T],
      },
  ): Promise<TaskActionOutputs[T]> {
    let { task, log } = params
    const runtimeContext = params["runtimeContext"] as (RuntimeContext | undefined)
    let module = omit(task.module, ["_ConfigType"])

    log.verbose(`Getting ${actionType} handler for task ${module.name}.${task.name}`)

    const handler = await this.getModuleActionHandler({
      moduleType: module.type,
      actionType,
      pluginName: params.pluginName,
      defaultHandler,
    })

    // Resolve ${runtime.*} template strings if needed.
    if (runtimeContext && (await getRuntimeTemplateReferences(module)).length > 0) {
      log.verbose(`Resolving runtime template strings for task '${task.name}'`)
      const configContext = await this.garden.getModuleConfigContext(runtimeContext)
      const graph = await this.garden.getConfigGraph({ configContext })
      task = await graph.getTask(task.name)
      module = task.module

      // Make sure everything has been resolved in the task config
      const remainingRefs = await getRuntimeTemplateReferences(task.config)
      if (remainingRefs.length > 0) {
        const unresolvedStrings = remainingRefs.map(ref => `\${${ref.join(".")}}`).join(", ")
        throw new ConfigurationError(
          `Unable to resolve one or more runtime template values for task '${task.name}': ${unresolvedStrings}`,
          { task, unresolvedStrings },
        )
      }
    }

    const handlerParams: any = {
      ...await this.commonParams(handler, (<any>params).log),
      ...params,
      module,
      task,
    }

    log.verbose(`Calling ${actionType} handler for task ${module.name}.${task.name}`)

    return (<Function>handler)(handlerParams)
  }

  private addActionHandler<T extends keyof PluginActions>(
    pluginName: string, plugin: GardenPlugin, actionType: T, handler: PluginActions[T],
  ) {
    const schema = pluginActionDescriptions[actionType].resultSchema

    const wrapped = async (...args) => {
      const result = await handler.apply(plugin, args)
      if (result === undefined) {
        throw new PluginError(`Got empty response from ${actionType} handler on ${pluginName}`, {
          args,
          actionType,
          pluginName,
        })
      }
      return validate(result, schema, { context: `${actionType} output from plugin ${pluginName}` })
    }
    wrapped["actionType"] = actionType
    wrapped["pluginName"] = pluginName

    this.actionHandlers[actionType][pluginName] = wrapped
  }

  private addModuleActionHandler<T extends keyof ModuleActions>(
    pluginName: string, plugin: GardenPlugin, actionType: T, moduleType: string, handler: ModuleActions[T],
  ) {
    const schema = moduleActionDescriptions[actionType].resultSchema

    const wrapped = async (...args: any[]) => {
      const result = await handler.apply(plugin, args)
      if (result === undefined) {
        throw new PluginError(`Got empty response from ${moduleType}.${actionType} handler on ${pluginName}`, {
          args,
          actionType,
          pluginName,
        })
      }
      return validate(result, schema, { context: `${actionType} output from plugin ${pluginName}` })
    }
    wrapped["actionType"] = actionType
    wrapped["pluginName"] = pluginName
    wrapped["moduleType"] = moduleType

    if (!this.moduleActionHandlers[actionType]) {
      this.moduleActionHandlers[actionType] = {}
    }

    if (!this.moduleActionHandlers[actionType][moduleType]) {
      this.moduleActionHandlers[actionType][moduleType] = {}
    }

    this.moduleActionHandlers[actionType][moduleType][pluginName] = wrapped
  }

  /**
   * Get a handler for the specified action.
   */
  public async getActionHandlers<T extends keyof PluginActions>(
    actionType: T, pluginName?: string,
  ): Promise<ActionHandlerMap<T>> {
    return this.filterActionHandlers(this.actionHandlers[actionType], pluginName)
  }

  /**
   * Get a handler for the specified module action.
   */
  public async getModuleActionHandlers<T extends keyof ModuleAndRuntimeActions>(
    { actionType, moduleType, pluginName }:
      { actionType: T, moduleType: string, pluginName?: string },
  ): Promise<ModuleActionHandlerMap<T>> {
    return this.filterActionHandlers((this.moduleActionHandlers[actionType] || {})[moduleType], pluginName)
  }

  private async filterActionHandlers(handlers, pluginName?: string) {
    // make sure plugin is loaded
    if (!!pluginName) {
      await this.garden.getPlugin(pluginName)
    }

    if (handlers === undefined) {
      handlers = {}
    }

    return !pluginName ? handlers : pickBy(handlers, (handler) => handler["pluginName"] === pluginName)
  }

  /**
   * Get the last configured handler for the specified action (and optionally module type).
   */
  public async getActionHandler<T extends keyof PluginActions>(
    { actionType, pluginName, defaultHandler }:
      { actionType: T, pluginName: string, defaultHandler?: PluginActions[T] },
  ): Promise<PluginActions[T]> {

    const handlers = Object.values(await this.getActionHandlers(actionType, pluginName))

    if (handlers.length) {
      this.garden.log.silly(`Found '${actionType}' handler on '${pluginName}'`)
      return handlers[handlers.length - 1]
    } else if (defaultHandler) {
      defaultHandler["pluginName"] = defaultProvider.name
      this.garden.log.silly(`Returned default '${actionType}' handler for '${pluginName}'`)
      return defaultHandler
    }

    const errorDetails = {
      requestedHandlerType: actionType,
      environment: this.garden.environmentName,
      pluginName,
    }

    if (pluginName) {
      throw new PluginError(`Plugin '${pluginName}' does not have a '${actionType}' handler.`, errorDetails)
    } else {
      throw new ParameterError(
        `No '${actionType}' handler configured in environment '${this.garden.environmentName}'. ` +
        `Are you missing a provider configuration?`,
        errorDetails,
      )
    }
  }

  /**
   * Get the last configured handler for the specified action.
   */
  public async getModuleActionHandler<T extends keyof ModuleAndRuntimeActions>(
    { actionType, moduleType, pluginName, defaultHandler }:
      { actionType: T, moduleType: string, pluginName?: string, defaultHandler?: ModuleAndRuntimeActions[T] },
  ): Promise<ModuleAndRuntimeActions[T]> {

    const handlers = Object.values(await this.getModuleActionHandlers({ actionType, moduleType, pluginName }))

    if (handlers.length) {
      return handlers[handlers.length - 1]
    } else if (defaultHandler) {
      defaultHandler["pluginName"] = defaultProvider.name
      return defaultHandler
    }

    const errorDetails = {
      requestedHandlerType: actionType,
      requestedModuleType: moduleType,
      environment: this.garden.environmentName,
      pluginName,
    }

    if (pluginName) {
      throw new PluginError(
        `Plugin '${pluginName}' does not have a '${actionType}' handler for module type '${moduleType}'.`,
        errorDetails,
      )
    } else {
      throw new ParameterError(
        `No '${actionType}' handler configured for module type '${moduleType}' in environment ` +
        `'${this.garden.environmentName}'. Are you missing a provider configuration?`,
        errorDetails,
      )
    }
  }
}

const dummyLogStreamer = async ({ service, log }: GetServiceLogsParams) => {
  log.warn({
    section: service.name,
    msg: chalk.yellow(`No handler for log retrieval available for module type ${service.module.type}`),
  })
  return {}
}

const dummyPublishHandler = async ({ module }) => {
  return {
    message: chalk.yellow(`No publish handler available for module type ${module.type}`),
    published: false,
  }
}

const dummyDeleteServiceHandler = async ({ module, log }: DeleteServiceParams) => {
  const msg = `No delete service handler available for module type ${module.type}`
  log.setError(msg)
  return {}
}
