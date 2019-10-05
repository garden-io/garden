/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")

import chalk from "chalk"
import { fromPairs, mapValues, omit, pickBy, keyBy } from "lodash"

import { PublishModuleParams, PublishResult } from "./types/plugin/module/publishModule"
import { SetSecretParams, SetSecretResult } from "./types/plugin/provider/setSecret"
import { validate } from "./config/common"
import { defaultProvider } from "./config/provider"
import { ParameterError, PluginError, ConfigurationError, InternalError } from "./exceptions"
import { Garden } from "./garden"
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
  ModuleActionHandlers,
  ModuleAndRuntimeActionHandlers,
  PluginActionOutputs,
  PluginActionParams,
  PluginActionHandlers,
  ServiceActionOutputs,
  ServiceActionParams,
  ServiceActionHandlers,
  TaskActionOutputs,
  TaskActionParams,
  TaskActionHandlers,
  moduleActionDescriptions,
  moduleActionNames,
  pluginActionDescriptions,
  pluginActionNames,
  GardenPlugin,
  PluginMap,
  WrappedModuleActionHandler,
  WrappedActionHandler,
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
import { ServiceStatus, ServiceStatusMap, ServiceState } from "./types/service"
import { Omit, getNames } from "./util/util"
import { DebugInfoMap } from "./types/plugin/provider/getDebugInfo"
import { PrepareEnvironmentParams, PrepareEnvironmentResult } from "./types/plugin/provider/prepareEnvironment"
import { GetPortForwardParams } from "./types/plugin/service/getPortForward"
import { StopPortForwardParams } from "./types/plugin/service/stopPortForward"
import { emptyRuntimeContext, RuntimeContext } from "./runtime-context"
import { GetServiceStatusTask } from "./tasks/get-service-status"
import { getServiceStatuses } from "./tasks/base"
import { getRuntimeTemplateReferences } from "./template-string"
import { getPluginBases, getPluginDependencies } from "./tasks/resolve-provider"
import { ConfigureProviderParams, ConfigureProviderResult } from "./types/plugin/provider/configureProvider"

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

/**
 * The ActionRouter takes care of choosing which plugin should be responsible for handling an action,
 * and preparing common parameters (so as to reduce boilerplate on the usage side).
 *
 * Each plugin and module action has a corresponding method on this class (aside from configureProvider, which
 * is handled especially elsewhere).
 */
export class ActionRouter implements TypeGuard {
  private readonly actionHandlers: WrappedPluginActionMap
  private readonly moduleActionHandlers: WrappedModuleActionMap
  private readonly loadedPlugins: PluginMap

  constructor(
    private readonly garden: Garden,
    configuredPlugins: GardenPlugin[],
    loadedPlugins: GardenPlugin[],
  ) {
    this.actionHandlers = <WrappedPluginActionMap>fromPairs(pluginActionNames.map(n => [n, {}]))
    this.moduleActionHandlers = <WrappedModuleActionMap>fromPairs(moduleActionNames.map(n => [n, {}]))
    this.loadedPlugins = keyBy(loadedPlugins, "name")

    garden.log.silly(`Creating ActionRouter with ${configuredPlugins.length} configured plugins`)

    for (const plugin of configuredPlugins) {
      const handlers = plugin.handlers || {}

      for (const actionType of pluginActionNames) {
        const handler = handlers[actionType]
        handler && this.addActionHandler(plugin, actionType, handler)
      }

      for (const spec of plugin.createModuleTypes || []) {
        for (const actionType of moduleActionNames) {
          const handler = spec.handlers[actionType]
          handler && this.addModuleActionHandler(plugin, actionType, spec.name, handler)
        }
      }

      for (const spec of plugin.extendModuleTypes || []) {
        for (const actionType of moduleActionNames) {
          const handler = spec.handlers[actionType]
          handler && this.addModuleActionHandler(plugin, actionType, spec.name, handler)
        }
      }
    }
  }

  //===========================================================================
  //region Environment Actions
  //===========================================================================

  async configureProvider(
    params: ConfigureProviderParams & { pluginName: string },
  ): Promise<ConfigureProviderResult> {
    const pluginName = params.pluginName

    this.garden.log.silly(`Calling 'configureProvider' handler on '${pluginName}'`)

    const handler = await this.getActionHandler({
      actionType: "configureProvider",
      pluginName,
      defaultHandler: async ({ config }) => ({ config }),
    })

    const handlerParams: PluginActionParams["configureProvider"] = {
      ...omit(params, ["pluginName"]),
      base: this.wrapBase(handler.base),
    }

    const result = (<Function>handler)(handlerParams)

    this.garden.log.silly(`Called 'configureProvider' handler on '${pluginName}'`)

    return result
  }

  async getEnvironmentStatus(
    params: RequirePluginName<ActionRouterParams<GetEnvironmentStatusParams>>,
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
    params: RequirePluginName<ActionRouterParams<PrepareEnvironmentParams>>,
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
    params: RequirePluginName<ActionRouterParams<CleanupEnvironmentParams>>,
  ) {
    const { pluginName } = params
    return this.callActionHandler({
      actionType: "cleanupEnvironment",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({}),
    })
  }

  async getSecret(params: RequirePluginName<ActionRouterParams<GetSecretParams>>): Promise<GetSecretResult> {
    const { pluginName } = params
    return this.callActionHandler({ actionType: "getSecret", pluginName, params: omit(params, ["pluginName"]) })
  }

  async setSecret(params: RequirePluginName<ActionRouterParams<SetSecretParams>>): Promise<SetSecretResult> {
    const { pluginName } = params
    return this.callActionHandler({ actionType: "setSecret", pluginName, params: omit(params, ["pluginName"]) })
  }

  async deleteSecret(params: RequirePluginName<ActionRouterParams<DeleteSecretParams>>): Promise<DeleteSecretResult> {
    const { pluginName } = params
    return this.callActionHandler({ actionType: "deleteSecret", pluginName, params: omit(params, ["pluginName"]) })
  }

  //endregion

  //===========================================================================
  //region Module Actions
  //===========================================================================

  async getBuildStatus<T extends Module>(
    params: ModuleActionRouterParams<GetBuildStatusParams<T>>,
  ): Promise<BuildStatus> {
    return this.callModuleHandler({
      params,
      actionType: "getBuildStatus",
      defaultHandler: async () => ({ ready: false }),
    })
  }

  async build<T extends Module>(params: ModuleActionRouterParams<BuildModuleParams<T>>): Promise<BuildResult> {
    return this.callModuleHandler({ params, actionType: "build" })
  }

  async publishModule<T extends Module>(
    params: ModuleActionRouterParams<PublishModuleParams<T>>,
  ): Promise<PublishResult> {
    return this.callModuleHandler({ params, actionType: "publish", defaultHandler: dummyPublishHandler })
  }

  async runModule<T extends Module>(params: ModuleActionRouterParams<RunModuleParams<T>>): Promise<RunResult> {
    return this.callModuleHandler({ params, actionType: "runModule" })
  }

  async testModule<T extends Module>(params: ModuleActionRouterParams<TestModuleParams<T>>): Promise<TestResult> {
    return this.callModuleHandler({ params, actionType: "testModule" })
  }

  async getTestResult<T extends Module>(
    params: ModuleActionRouterParams<GetTestResultParams<T>>,
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

  async getServiceStatus(params: ServiceActionRouterParams<GetServiceStatusParams>): Promise<ServiceStatus> {
    return this.callServiceHandler({ params, actionType: "getServiceStatus" })
  }

  async deployService(params: ServiceActionRouterParams<DeployServiceParams>): Promise<ServiceStatus> {
    return this.callServiceHandler({ params, actionType: "deployService" })
  }

  async hotReloadService(params: ServiceActionRouterParams<HotReloadServiceParams>)
    : Promise<HotReloadServiceResult> {
    return this.callServiceHandler(({ params, actionType: "hotReloadService" }))
  }

  async deleteService(params: ServiceActionRouterParams<DeleteServiceParams>): Promise<ServiceStatus> {
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

  async execInService(params: ServiceActionRouterParams<ExecInServiceParams>): Promise<ExecInServiceResult> {
    return this.callServiceHandler({ params, actionType: "execInService" })
  }

  async getServiceLogs(params: ServiceActionRouterParams<GetServiceLogsParams>): Promise<GetServiceLogsResult> {
    return this.callServiceHandler({ params, actionType: "getServiceLogs", defaultHandler: dummyLogStreamer })
  }

  async runService(params: ServiceActionRouterParams<RunServiceParams>): Promise<RunResult> {
    return this.callServiceHandler({ params, actionType: "runService" })
  }

  async getPortForward(params: ServiceActionRouterParams<GetPortForwardParams>) {
    return this.callServiceHandler({ params, actionType: "getPortForward" })
  }

  async stopPortForward(params: ServiceActionRouterParams<StopPortForwardParams>) {
    return this.callServiceHandler({ params, actionType: "stopPortForward" })
  }

  //endregion

  //===========================================================================
  //region Task Methods
  //===========================================================================

  async runTask(params: TaskActionRouterParams<RunTaskParams>): Promise<RunTaskResult> {
    return this.callTaskHandler({ params, actionType: "runTask" })
  }

  async getTaskResult(params: TaskActionRouterParams<GetTaskResultParams>): Promise<RunTaskResult | null> {
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
    log.debug(`Getting environment status (${this.garden.projectName})`)

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
  private async commonParams(
    handler: WrappedActionHandler<any, any>, log: LogEntry,
  ): Promise<PluginActionParamsBase> {
    const provider = await this.garden.resolveProvider(handler.pluginName)

    return {
      ctx: this.garden.getPluginContext(provider),
      log,
      base: handler.base,
    }
  }

  // We special-case the configureProvider handlers and don't call them through this
  private async callActionHandler<T extends keyof Omit<WrappedPluginActionHandlers, "configureProvider">>(
    { params, actionType, pluginName, defaultHandler }:
      {
        params: ActionRouterParams<PluginActionParams[T]>,
        actionType: T,
        pluginName: string,
        defaultHandler?: PluginActionHandlers[T],
      },
  ): Promise<PluginActionOutputs[T]> {
    this.garden.log.silly(`Calling ${actionType} handler on plugin '${pluginName}'`)

    const handler = await this.getActionHandler({
      actionType,
      pluginName,
      defaultHandler,
    })

    const handlerParams: PluginActionParams[T] = {
      ...await this.commonParams(handler, params.log),
      ...<any>params,
    }

    const result = await (<Function>handler)(handlerParams)

    this.garden.log.silly(`Called ${actionType} handler on plugin '${pluginName}'`)

    return result
  }

  private async callModuleHandler<T extends keyof Omit<ModuleActionHandlers, "configure">>(
    { params, actionType, defaultHandler }:
      {
        params: ModuleActionRouterParams<ModuleActionParams[T]>,
        actionType: T,
        defaultHandler?: ModuleActionHandlers[T],
      },
  ): Promise<ModuleActionOutputs[T]> {
    const { module, pluginName, log } = params

    log.silly(`Getting ${actionType} handler for module ${module.name}`)

    const handler = await this.getModuleActionHandler({
      moduleType: module.type,
      actionType,
      pluginName,
      defaultHandler: defaultHandler as WrappedModuleAndRuntimeActionHandlers[T],
    })

    const handlerParams = {
      ...await this.commonParams(handler, (<any>params).log),
      ...params,
      module: omit(module, ["_ConfigType"]),
    }

    log.silly(`Calling ${actionType} handler for module ${module.name}`)

    // TODO: figure out why this doesn't compile without the function cast
    return (<Function>handler)(handlerParams)
  }

  private async callServiceHandler<T extends keyof ServiceActionHandlers>(
    { params, actionType, defaultHandler }:
      {
        params: ServiceActionRouterParams<ServiceActionParams[T]>,
        actionType: T,
        defaultHandler?: ServiceActionHandlers[T],
      },
  ): Promise<ServiceActionOutputs[T]> {
    let { log, service, runtimeContext } = params
    let module = omit(service.module, ["_ConfigType"])

    log.silly(`Getting ${actionType} handler for service ${service.name}`)

    const handler = await this.getModuleActionHandler({
      moduleType: module.type,
      actionType,
      pluginName: params.pluginName,
      defaultHandler: defaultHandler as ModuleAndRuntimeActionHandlers[T],
    })

    // Resolve ${runtime.*} template strings if needed.
    if (runtimeContext && (await getRuntimeTemplateReferences(module)).length > 0) {
      log.silly(`Resolving runtime template strings for service '${service.name}'`)
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

    log.silly(`Calling ${actionType} handler for service ${service.name}`)

    return (<Function>handler)(handlerParams)
  }

  private async callTaskHandler<T extends keyof TaskActionHandlers>(
    { params, actionType, defaultHandler }:
      {
        params: TaskActionRouterParams<TaskActionParams[T]>, actionType: T,
        defaultHandler?: TaskActionHandlers[T],
      },
  ): Promise<TaskActionOutputs[T]> {
    let { task, log } = params
    const runtimeContext = params["runtimeContext"] as (RuntimeContext | undefined)
    let module = omit(task.module, ["_ConfigType"])

    log.silly(`Getting ${actionType} handler for task ${module.name}.${task.name}`)

    const handler = await this.getModuleActionHandler({
      moduleType: module.type,
      actionType,
      pluginName: params.pluginName,
      defaultHandler: defaultHandler as ModuleAndRuntimeActionHandlers[T],
    })

    // Resolve ${runtime.*} template strings if needed.
    if (runtimeContext && (await getRuntimeTemplateReferences(module)).length > 0) {
      log.silly(`Resolving runtime template strings for task '${task.name}'`)
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

    log.silly(`Calling ${actionType} handler for task ${module.name}.${task.name}`)

    return (<Function>handler)(handlerParams)
  }

  private addActionHandler<T extends keyof WrappedPluginActionHandlers>(
    plugin: GardenPlugin, actionType: T, handler: PluginActionHandlers[T],
  ) {
    const pluginName = plugin.name
    const schema = pluginActionDescriptions[actionType].resultSchema

    // Wrap the handler with identifying attributes
    const wrapped: WrappedPluginActionHandlers[T] = Object.assign(
      async (...args: any[]) => {
        const result = await handler.apply(plugin, args)
        if (result === undefined) {
          throw new PluginError(`Got empty response from ${actionType} handler on ${pluginName}`, {
            args,
            actionType,
            pluginName,
          })
        }
        return validate(result, schema, { context: `${actionType} output from plugin ${pluginName}` })
      },
      { actionType, pluginName },
    )

    wrapped.base = this.wrapBase(handler.base)

    // I'm not sure why we need the cast here - JE
    const typeHandlers: any = this.actionHandlers[actionType]
    typeHandlers[pluginName] = wrapped
  }

  private addModuleActionHandler<T extends keyof ModuleActionHandlers>(
    plugin: GardenPlugin, actionType: T, moduleType: string, handler: ModuleActionHandlers[T],
  ) {
    const pluginName = plugin.name
    const schema = moduleActionDescriptions[actionType].resultSchema

    // Wrap the handler with identifying attributes
    const wrapped = Object.assign(
      <WrappedModuleActionHandlers[T]>(async (...args: any[]) => {
        const result = await handler.apply(plugin, args)
        if (result === undefined) {
          throw new PluginError(`Got empty response from ${moduleType}.${actionType} handler on ${pluginName}`, {
            args,
            actionType,
            pluginName,
          })
        }
        return validate(result, schema, { context: `${actionType} output from plugin ${pluginName}` })
      }),
      { actionType, pluginName, moduleType },
    )

    wrapped.base = this.wrapBase(handler.base)

    if (!this.moduleActionHandlers[actionType]) {
      this.moduleActionHandlers[actionType] = {}
    }

    if (!this.moduleActionHandlers[actionType][moduleType]) {
      // I'm not sure why we need the cast here - JE
      (<any>this.moduleActionHandlers[actionType])[moduleType] = {}
    }

    this.moduleActionHandlers[actionType][moduleType][pluginName] = wrapped
  }

  /**
   * Recursively wraps the base handler (if any) on an action handler, such that the base handler receives the _next_
   * base handler as the `base` parameter when called from within the handler.
   */
  private wrapBase<T extends WrappedActionHandler<any, any> | WrappedModuleActionHandler<any, any>>(
    handler?: T,
  ): T | undefined {
    if (!handler) {
      return undefined
    }

    const base = this.wrapBase(handler.base)

    const wrapped = <T>Object.assign(
      async (params) => {
        // Override the base parameter, to recursively allow each base to call its base.
        params.log.silly(`Calling base handler for ${handler.actionType} handler on plugin '${handler.pluginName}'`)

        return handler({ ...params, base })
      },
      { ...handler, base },
    )

    return wrapped
  }

  /**
   * Get a handler for the specified action.
   */
  public async getActionHandlers<T extends keyof WrappedPluginActionHandlers>(
    actionType: T, pluginName?: string,
  ): Promise<WrappedActionHandlerMap<T>> {
    return this.filterActionHandlers(this.actionHandlers[actionType], pluginName)
  }

  /**
   * Get a handler for the specified module action.
   */
  public async getModuleActionHandlers<T extends keyof ModuleAndRuntimeActionHandlers>(
    { actionType, moduleType, pluginName }:
      { actionType: T, moduleType: string, pluginName?: string },
  ): Promise<WrappedModuleActionHandlerMap<T>> {
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

    return !pluginName ? handlers : pickBy(handlers, (handler) => handler.pluginName === pluginName)
  }

  /**
   * Get the last configured handler for the specified action (and optionally module type).
   */
  public async getActionHandler<T extends keyof WrappedPluginActionHandlers>(
    { actionType, pluginName, defaultHandler }:
      { actionType: T, pluginName: string, defaultHandler?: PluginActionHandlers[T] },
  ): Promise<WrappedPluginActionHandlers[T]> {

    const handlers = Object.values(await this.getActionHandlers(actionType, pluginName))

    // Since we only allow retrieving by plugin name, the length is always either 0 or 1
    if (handlers.length) {
      this.garden.log.silly(`Found '${actionType}' handler on '${pluginName}'`)
      return handlers[handlers.length - 1]
    } else if (defaultHandler) {
      this.garden.log.silly(`Returned default '${actionType}' handler for '${pluginName}'`)
      return Object.assign(
        // TODO: figure out why we need the cast here
        <WrappedPluginActionHandlers[T]>defaultHandler,
        { actionType, pluginName: defaultProvider.name },
      )
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
  public async getModuleActionHandler<T extends keyof ModuleAndRuntimeActionHandlers>(
    { actionType, moduleType, pluginName, defaultHandler }:
      { actionType: T, moduleType: string, pluginName?: string, defaultHandler?: ModuleAndRuntimeActionHandlers[T] },
  ): Promise<WrappedModuleAndRuntimeActionHandlers[T]> {
    const handlers = Object.values(await this.getModuleActionHandlers({ actionType, moduleType, pluginName }))

    if (handlers.length === 1) {
      // Nice and simple, just return the only applicable handler
      return handlers[0]
    } else if (handlers.length > 0) {
      // Multiple matches. We start by filtering down to "leaf nodes", i.e. handlers which are not being overridden
      // by other matched handlers.
      const filtered = handlers.filter(handler => {
        for (const other of handlers) {
          if (other === handler) {
            continue
          }

          const plugin = this.loadedPlugins[other.pluginName]
          const bases = getPluginBases(plugin, this.loadedPlugins)
          const deps = getPluginDependencies(plugin, this.loadedPlugins)
          const allDepNames = [...getNames(bases), ...getNames(deps)]

          if (allDepNames.includes(handler.pluginName)) {
            // This handler is in `other`'s dependency chain, so `other` is overriding it
            return false
          }
        }
        return true
      })

      if (filtered.length > 1) {
        // If we still end up with multiple handlers with no obvious best candidate, we use the order of configuration
        // as a tie-breaker.
        const configs = this.garden.getRawProviderConfigs()

        for (const config of configs.reverse()) {
          for (const handler of handlers) {
            if (handler.pluginName === config.name) {
              return handler
            }
          }
        }

        // This should never happen
        throw new InternalError(
          `Unable to find any matching configuration when selecting ${moduleType}/${actionType} handler ` +
          `(please report this as a bug).`,
          { handlers, configs },
        )
      } else {
        return filtered[0]
      }

    } else if (defaultHandler) {
      // Return the default handler, but wrap it to match the expected interface.
      return Object.assign(
        <WrappedModuleAndRuntimeActionHandlers[T]>defaultHandler,
        { actionType, moduleType, pluginName: defaultProvider.name },
      )
    } else {
      // Nothing matched, throw error.
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
}

type CommonParams = keyof PluginActionContextParams

type WrappedServiceActionHandlers<T extends Module = Module> = {
  [P in keyof ServiceActionParams<T>]: WrappedModuleActionHandler<ServiceActionParams<T>[P], ServiceActionOutputs[P]>
}

type WrappedTaskActionHandlers<T extends Module = Module> = {
  [P in keyof TaskActionParams<T>]: WrappedModuleActionHandler<TaskActionParams<T>[P], TaskActionOutputs[P]>
}

type WrappedModuleActionHandlers<T extends Module = Module> = {
  [P in keyof ModuleActionParams<T>]: WrappedModuleActionHandler<ModuleActionParams<T>[P], ModuleActionOutputs[P]>
}

type WrappedModuleAndRuntimeActionHandlers<T extends Module = Module> =
  WrappedModuleActionHandlers<T> & WrappedServiceActionHandlers<T> & WrappedTaskActionHandlers<T>

type WrappedPluginActionHandlers = {
  [P in keyof PluginActionParams]:
  WrappedActionHandler<PluginActionParams[P], PluginActionOutputs[P]>
}

interface WrappedActionHandlerMap<T extends keyof WrappedPluginActionHandlers> {
  [actionName: string]: WrappedPluginActionHandlers[T]
}

interface WrappedModuleActionHandlerMap<T extends keyof ModuleAndRuntimeActionHandlers> {
  [actionName: string]: WrappedModuleAndRuntimeActionHandlers[T]
}

type WrappedPluginActionMap = {
  [A in keyof WrappedPluginActionHandlers]: {
    [pluginName: string]: WrappedPluginActionHandlers[A],
  }
}

type WrappedModuleActionMap = {
  [A in keyof ModuleAndRuntimeActionHandlers]: {
    [moduleType: string]: {
      [pluginName: string]: WrappedModuleAndRuntimeActionHandlers[A],
    },
  }
}

// avoid having to specify common params on each action helper call
type ActionRouterParams<T extends PluginActionParamsBase> =
  Omit<T, CommonParams> & { pluginName?: string }

type ModuleActionRouterParams<T extends PluginModuleActionParamsBase> =
  Omit<T, CommonParams> & { pluginName?: string }
// additionally make runtimeContext param optional

type ServiceActionRouterParams<T extends PluginServiceActionParamsBase> =
  Omit<T, "module" | CommonParams>
  & { pluginName?: string }

type TaskActionRouterParams<T extends PluginTaskActionParamsBase> =
  Omit<T, "module" | CommonParams>
  & { pluginName?: string }

type RequirePluginName<T> = T & { pluginName: string }

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
  return { state: "missing" as ServiceState, detail: {} }
}
