/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import chalk from "chalk"
import { Garden } from "./garden"
import { PrimitiveMap } from "./config/common"
import { Module } from "./types/module"
import { ModuleActions, ServiceActions, PluginActions } from "./types/plugin/plugin"
import {
  BuildResult,
  BuildStatus,
  DeleteSecretResult,
  EnvironmentStatusMap,
  ExecInServiceResult,
  GetSecretResult,
  GetServiceLogsResult,
  ModuleActionOutputs,
  PushResult,
  RunResult,
  ServiceActionOutputs,
  SetSecretResult,
  TestResult,
  PluginActionOutputs,
  PublishResult,
} from "./types/plugin/outputs"
import {
  BuildModuleParams,
  DeleteSecretParams,
  DeployServiceParams,
  DeleteServiceParams,
  ExecInServiceParams,
  GetSecretParams,
  GetBuildStatusParams,
  GetServiceLogsParams,
  GetServiceOutputsParams,
  GetServiceStatusParams,
  GetTestResultParams,
  ModuleActionParams,
  PluginActionContextParams,
  PluginActionParams,
  PluginActionParamsBase,
  PluginServiceActionParamsBase,
  PushModuleParams,
  RunModuleParams,
  RunServiceParams,
  ServiceActionParams,
  SetSecretParams,
  TestModuleParams,
  GetEnvironmentStatusParams,
  PluginModuleActionParamsBase,
  PublishModuleParams,
} from "./types/plugin/params"
import {
  Service,
  ServiceStatus,
  prepareRuntimeContext,
} from "./types/service"
import { mapValues, values, keyBy, omit } from "lodash"
import { Omit } from "./util/util"
import { RuntimeContext } from "./types/service"
import { processServices, ProcessResults } from "./process"
import { getDeployTasks } from "./tasks/deploy"
import { LogEntry } from "./logger/log-entry"
import { createPluginContext } from "./plugin-context"
import { CleanupEnvironmentParams } from "./types/plugin/params"
import { ConfigurationError } from "./exceptions"

type TypeGuard = {
  readonly [P in keyof (PluginActionParams | ModuleActionParams<any>)]: (...args: any[]) => Promise<any>
}

export interface ContextStatus {
  providers: EnvironmentStatusMap
  services: { [name: string]: ServiceStatus }
}

export interface DeployServicesParams {
  serviceNames?: string[],
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
  Omit<T, "module" | "runtimeContext" | keyof PluginActionContextParams>
  & { runtimeContext?: RuntimeContext, pluginName?: string }

type RequirePluginName<T> = T & { pluginName: string }

export class ActionHelper implements TypeGuard {
  constructor(private garden: Garden) { }

  //===========================================================================
  //region Environment Actions
  //===========================================================================

  async getEnvironmentStatus(
    { pluginName }: ActionHelperParams<GetEnvironmentStatusParams>,
  ): Promise<EnvironmentStatusMap> {
    const handlers = this.garden.getActionHandlers("getEnvironmentStatus", pluginName)
    return Bluebird.props(mapValues(handlers, h => h({ ...this.commonParams(h) })))
  }

  /**
   * Checks environment status and calls prepareEnvironment for each provider that isn't flagged as ready.
   *
   * If any of the getEnvironmentStatus handlers returns needUserInput=true, this throws and guides the user to
   * run `garden init`
   */
  async prepareEnvironment(
    { force = false, pluginName, logEntry, allowUserInput = false }:
      { force?: boolean, pluginName?: string, logEntry?: LogEntry, allowUserInput?: boolean },
  ) {
    const handlers = this.garden.getActionHandlers("prepareEnvironment", pluginName)
    const statuses = await this.getEnvironmentStatus({ pluginName })

    const needUserInput = Object.entries(statuses)
      .map(([name, status]) => ({ ...status, name }))
      .filter(status => status.needUserInput === true)

    if (!allowUserInput && needUserInput.length > 0) {
      const names = needUserInput.map(s => s.name).join(", ")
      const msgPrefix = needUserInput.length === 1
        ? `Plugin ${names} has been updated or hasn't been configured, and requires user input.`
        : `Plugins ${names} have been updated or haven't been configured, and require user input.`

      throw new ConfigurationError(
        `${msgPrefix}. Please run \`garden init\` and then re-run this command.`,
        { statuses },
      )
    }

    const output = {}

    // sequentially go through the preparation steps, to allow plugins to request user input
    for (const [name, handler] of Object.entries(handlers)) {
      const status = statuses[name] || { ready: false }

      if (status.ready && !force) {
        continue
      }

      const envLogEntry = (logEntry || this.garden.log).info({
        status: "active",
        section: name,
        msg: "Preparing environment...",
      })

      await handler({ ...this.commonParams(handler), force, status, logEntry: envLogEntry })

      envLogEntry.setSuccess("Configured")

      output[name] = true
    }

    return output
  }

  async cleanupEnvironment(
    { pluginName }: ActionHelperParams<CleanupEnvironmentParams>,
  ): Promise<EnvironmentStatusMap> {
    const handlers = this.garden.getActionHandlers("cleanupEnvironment", pluginName)
    await Bluebird.each(values(handlers), h => h({ ...this.commonParams(h) }))
    return this.getEnvironmentStatus({ pluginName })
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
    await this.garden.buildDir.syncDependencyProducts(params.module)
    return this.callModuleHandler({ params, actionType: "build" })
  }

  async pushModule<T extends Module>(params: ModuleActionHelperParams<PushModuleParams<T>>): Promise<PushResult> {
    return this.callModuleHandler({ params, actionType: "pushModule", defaultHandler: dummyPushHandler })
  }

  async publishModule<T extends Module>(
    params: ModuleActionHelperParams<PublishModuleParams<T>>,
  ): Promise<PublishResult> {
    return this.callModuleHandler({ params, actionType: "publishModule", defaultHandler: dummyPublishHandler })
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

  async deleteService(params: ServiceActionHelperParams<DeleteServiceParams>): Promise<ServiceStatus> {
    const logEntry = this.garden.log.info({
      section: params.service.name,
      msg: "Deleting...",
      status: "active",
    })
    return this.callServiceHandler({
      params: { ...params, logEntry },
      actionType: "deleteService",
      defaultHandler: dummyDeleteServiceHandler,
    })
  }

  async getServiceOutputs(params: ServiceActionHelperParams<GetServiceOutputsParams>): Promise<PrimitiveMap> {
    return this.callServiceHandler({
      params,
      actionType: "getServiceOutputs",
      defaultHandler: async () => ({}),
    })
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

  //endregion

  //===========================================================================
  //region Helper Methods
  //===========================================================================

  async getStatus(): Promise<ContextStatus> {
    const envStatus: EnvironmentStatusMap = await this.getEnvironmentStatus({})
    const services = keyBy(await this.garden.getServices(), "name")

    const serviceStatus = await Bluebird.props(mapValues(services, async (service: Service) => {
      const dependencies = await this.garden.getServices(service.config.dependencies)
      const runtimeContext = await prepareRuntimeContext(this.garden, service.module, dependencies)
      return this.getServiceStatus({ service, runtimeContext })
    }))

    return {
      providers: envStatus,
      services: serviceStatus,
    }
  }

  async deployServices(
    { serviceNames, force = false, forceBuild = false }: DeployServicesParams,
  ): Promise<ProcessResults> {
    const services = await this.garden.getServices(serviceNames)

    return processServices({
      services,
      garden: this.garden,
      watch: false,
      handler: async (module) => getDeployTasks({
        garden: this.garden,
        module,
        serviceNames,
        force,
        forceBuild,
        includeDependants: false,
      }),
    })
  }

  //endregion

  // TODO: find a nicer way to do this (like a type-safe wrapper function)
  private commonParams(handler, logEntry?: LogEntry): PluginActionParamsBase {
    return {
      ctx: createPluginContext(this.garden, handler["pluginName"]),
      // TODO: find a better way for handlers to log during execution
      logEntry,
    }
  }

  private async callActionHandler<T extends keyof PluginActions>(
    { params, actionType, pluginName, defaultHandler }:
      {
        params: ActionHelperParams<PluginActionParams[T]>,
        actionType: T,
        pluginName?: string,
        defaultHandler?: PluginActions[T],
      },
  ): Promise<PluginActionOutputs[T]> {
    const handler = this.garden.getActionHandler({
      actionType,
      pluginName,
      defaultHandler,
    })
    const handlerParams: PluginActionParams[T] = {
      ...this.commonParams(handler),
      ...<object>params,
    }
    return (<Function>handler)(handlerParams)
  }

  private async callModuleHandler<T extends keyof Omit<ModuleActions, "describeType" | "validate">>(
    { params, actionType, defaultHandler }:
      { params: ModuleActionHelperParams<ModuleActionParams[T]>, actionType: T, defaultHandler?: ModuleActions[T] },
  ): Promise<ModuleActionOutputs[T]> {
    // the type system is messing me up here, not sure why I need the any cast... - j.e.
    const { module, pluginName } = <any>params
    const handler = await this.garden.getModuleActionHandler({
      moduleType: module.type,
      actionType,
      pluginName,
      defaultHandler,
    })
    const handlerParams: any = {
      ...this.commonParams(handler),
      ...omit(<object>params, ["module"]),
      module: omit(module, ["_ConfigType"]),
    }
    // TODO: figure out why this doesn't compile without the function cast
    return (<Function>handler)(handlerParams)
  }

  private async callServiceHandler<T extends keyof ServiceActions>(
    { params, actionType, defaultHandler }:
      { params: ServiceActionHelperParams<ServiceActionParams[T]>, actionType: T, defaultHandler?: ServiceActions[T] },
  ): Promise<ServiceActionOutputs[T]> {
    const { service } = <any>params
    const module = service.module

    const handler = await this.garden.getModuleActionHandler({
      moduleType: module.type,
      actionType,
      pluginName: params.pluginName,
      defaultHandler,
    })

    // TODO: figure out why this doesn't compile without the casts
    const deps = await this.garden.getServices(service.config.dependencies)
    const runtimeContext = ((<any>params).runtimeContext || await prepareRuntimeContext(this.garden, module, deps))

    const handlerParams: any = {
      ...this.commonParams(handler),
      ...<object>params,
      module,
      runtimeContext,
    }

    return (<Function>handler)(handlerParams)
  }
}

const dummyLogStreamer = async ({ service, logEntry }: GetServiceLogsParams) => {
  logEntry && logEntry.warn({
    section: service.name,
    msg: chalk.yellow(`No handler for log retrieval available for module type ${service.module.type}`),
  })
  return {}
}

const dummyPushHandler = async () => {
  return { pushed: false }
}

const dummyPublishHandler = async ({ module }) => {
  return {
    message: chalk.yellow(`No publish handler available for module type ${module.type}`),
    published: false,
  }
}

const dummyDeleteServiceHandler = async ({ module, logEntry }: DeleteServiceParams) => {
  const msg = `No delete service handler available for module type ${module.type}`
  logEntry && logEntry.setError(msg)
  return {}
}
