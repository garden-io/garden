/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { omit } from "lodash"
import tmp from "tmp-promise"
import normalizePath = require("normalize-path")

import { validateSchema } from "../config/validation"
import { PluginError, RuntimeError } from "../exceptions"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { GardenModule } from "../types/module"
import {
  PluginModuleActionParamsBase,
  PluginServiceActionParamsBase,
  PluginTaskActionParamsBase,
  RunResult,
  runStatus,
} from "../plugin/base"
import { TestResult } from "../types/test"
import { TestModuleParams } from "../types/plugin/module/testModule"
import {
  GardenPlugin,
  ModuleTypeDefinition,
} from "../plugin/plugin"
import { DeleteServiceParams } from "../types/plugin/service/deleteService"
import { DeployServiceParams } from "../types/plugin/service/deployService"
import { ExecInServiceParams, ExecInServiceResult } from "../types/plugin/service/execInService"
import { GetServiceLogsParams, GetServiceLogsResult } from "../types/plugin/service/getServiceLogs"
import { GetServiceStatusParams } from "../types/plugin/service/getServiceStatus"
import { RunServiceParams } from "../types/plugin/service/runService"
import { GetTaskResultParams } from "../types/plugin/task/getTaskResult"
import { RunTaskParams, RunTaskResult } from "../types/plugin/task/runTask"
import { ServiceStatus, ServiceStatusMap, ServiceState, GardenService } from "../types/service"
import { Omit, uuidv4 } from "../util/util"
import { GetPortForwardParams } from "../types/plugin/service/getPortForward"
import { StopPortForwardParams } from "../types/plugin/service/stopPortForward"
import { emptyRuntimeContext } from "../runtime-context"
import { GetServiceStatusTask } from "../tasks/get-service-status"
import { getServiceStatuses } from "../tasks/base"
import { getRuntimeTemplateReferences, resolveTemplateStrings } from "../template-string/template-string"
import { getModuleTypeBases } from "../plugins"
import { GardenTask } from "../types/task"
import { PluginEventBroker } from "../plugin-context"
import { DeleteServiceTask, deletedServiceStatuses } from "../tasks/delete-service"
import { realpath } from "fs-extra"
import { copyArtifacts, getArtifactKey } from "../util/artifacts"
import { DeployTask } from "../tasks/deploy"
import { Profile } from "../util/profiling"
import { ConfigGraph } from "../graph/config-graph"
import { ModuleConfigContext } from "../config/template-contexts/module"
import { GetTestResultParams } from "../types/plugin/module/getTestResult"
import { ModuleGraph } from "../graph/modules"
import { ProviderRouter } from "./provider"
import { BaseRouter, CommonParams } from "./base"
import { ModuleRouter } from "./module"
import { BuildRouter } from "./build"

export interface DeployManyParams {
  graph: ConfigGraph
  log: LogEntry
  deployNames?: string[]
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
@Profile()
export class ActionRouter extends BaseRouter {
  public readonly provider: ProviderRouter
  public readonly module: ModuleRouter
  public readonly build: BuildRouter

  constructor(
    garden: Garden,
    configuredPlugins: GardenPlugin[],
    loadedPlugins: GardenPlugin[],
    moduleTypes: { [name: string]: ModuleTypeDefinition }
  ) {
    super(garden, configuredPlugins, loadedPlugins)

    this.provider = new ProviderRouter(garden, configuredPlugins, loadedPlugins)
    this.module = new ModuleRouter(garden, configuredPlugins, loadedPlugins, moduleTypes)
    this.build = new BuildRouter("build", garden, configuredPlugins, loadedPlugins)

    garden.log.silly(`Creating ActionRouter with ${configuredPlugins.length} configured providers`)
  }

  //===========================================================================
  //region Build Handlers
  //===========================================================================

  async testModule<T extends GardenModule>(
    params: ModuleActionRouterParams<Omit<TestModuleParams<T>, "artifactsPath">>
  ): Promise<TestResult> {
    const tmpDir = await tmp.dir({ unsafeCleanup: true })
    const artifactsPath = normalizePath(await realpath(tmpDir.path))
    const actionUid = uuidv4()
    const testName = params.test.name
    const testVersion = params.test.version
    const moduleName = params.module.name
    const moduleVersion = params.module.version.versionString
    this.garden.events.emit("testStatus", {
      testName,
      moduleName,
      moduleVersion,
      testVersion,
      actionUid,
      status: { state: "running", startedAt: new Date() },
    })

    params.events = params.events || new PluginEventBroker()

    try {
      // Annotate + emit log output
      params.events.on("log", ({ timestamp, data }) => {
        this.garden.events.emit("log", {
          timestamp,
          actionUid,
          entity: {
            type: "test",
            key: `${moduleName}.${testName}`,
            moduleName,
          },
          data: data.toString(),
        })
      })

      const result = await this.callModuleHandler({ params: { ...params, artifactsPath }, handlerType: "testModule" })

      // Emit status
      this.garden.events.emit("testStatus", {
        testName,
        moduleName,
        moduleVersion,
        testVersion,
        actionUid,
        status: runStatus(result),
      })
      this.emitNamespaceEvent(result.namespaceStatus)

      return result
    } finally {
      // Copy everything from the temp directory, and then clean it up
      try {
        await copyArtifacts({
          garden: this.garden,
          log: params.log,
          artifactsPath,
          key: getArtifactKey("test", params.test.name, params.test.version)
        })
      } finally {
        await tmpDir.cleanup()
      }
    }
  }

  async getTestResult<T extends GardenModule>(
    params: ModuleActionRouterParams<GetTestResultParams<T>>
  ): Promise<TestResult | null> {
    const result = await this.callModuleHandler({
      params,
      handlerType: "getTestResult",
      defaultHandler: async () => null,
    })
    this.garden.events.emit("testStatus", {
      testName: params.test.name,
      moduleName: params.module.name,
      moduleVersion: params.module.version.versionString,
      testVersion: params.test.version,
      status: runStatus(result),
    })
    return result
  }

  //endregion

  //===========================================================================
  //region Service Actions
  //===========================================================================

  async getServiceStatus(params: ServiceActionRouterParams<GetServiceStatusParams>): Promise<ServiceStatus> {
    const { result } = await this.callServiceHandler({ params, handlerType: "getServiceStatus" })
    this.garden.events.emit("serviceStatus", {
      serviceName: params.service.name,
      moduleVersion: params.service.module.version.versionString,
      moduleName: params.service.module.name,
      serviceVersion: params.service.version,
      status: omit(result, "detail"),
    })
    this.emitNamespaceEvents(result.namespaceStatuses)
    this.validateServiceOutputs(params.service, result)
    return result
  }

  async deployService(params: ServiceActionRouterParams<DeployServiceParams>): Promise<ServiceStatus> {
    const actionUid = uuidv4()
    params.events = params.events || new PluginEventBroker()
    const serviceName = params.service.name
    const moduleVersion = params.service.module.version.versionString
    const moduleName = params.service.module.name
    params.events.on("log", ({ timestamp, data }) => {
      this.garden.events.emit("log", {
        timestamp,
        actionUid,
        entity: {
          type: "deploy",
          key: `${serviceName}`,
          moduleName,
        },
        data: data.toString(),
      })
    })
    const serviceVersion = params.service.version
    const deployStartedAt = new Date()
    this.garden.events.emit("serviceStatus", {
      serviceName,
      moduleName,
      moduleVersion,
      serviceVersion,
      actionUid,
      status: { state: "deploying", deployStartedAt },
    })
    const { result } = await this.callServiceHandler({ params, handlerType: "deployService" })
    this.garden.events.emit("serviceStatus", {
      serviceName,
      moduleName,
      moduleVersion,
      serviceVersion,
      actionUid,
      status: {
        ...omit(result, "detail"),
        deployStartedAt,
        deployCompletedAt: new Date(),
      },
    })
    this.emitNamespaceEvents(result.namespaceStatuses)
    this.validateServiceOutputs(params.service, result)
    return result
  }

  private validateServiceOutputs(service: GardenService, result: ServiceStatus) {
    const spec = this.moduleTypes[service.module.type]

    if (spec.serviceOutputsSchema) {
      result.outputs = validateSchema(result.outputs, spec.serviceOutputsSchema, {
        context: `outputs from service '${service.name}'`,
        ErrorClass: PluginError,
      })
    }

    for (const base of getModuleTypeBases(spec, this.moduleTypes)) {
      if (base.serviceOutputsSchema) {
        result.outputs = validateSchema(result.outputs, base.serviceOutputsSchema.unknown(true), {
          context: `outputs from service '${service.name}' (base schema from '${base.name}' plugin)`,
          ErrorClass: PluginError,
        })
      }
    }
  }

  async deleteService(params: ServiceActionRouterParams<DeleteServiceParams>): Promise<ServiceStatus> {
    const log = params.log.info({
      section: params.service.name,
      msg: "Deleting...",
      status: "active",
    })

    const runtimeContext = emptyRuntimeContext
    const status = await this.getServiceStatus({ ...params, runtimeContext, devMode: false })

    if (status.state === "missing") {
      log.setSuccess({
        section: params.service.name,
        msg: "Not found",
      })
      return status
    }

    const { result } = await this.callServiceHandler({
      params: { ...params, log },
      handlerType: "deleteService",
      defaultHandler: dummyDeleteServiceHandler,
    })

    this.emitNamespaceEvents(result.namespaceStatuses)

    log.setSuccess({
      msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`),
      append: true,
    })

    return result
  }

  async execInService(params: ServiceActionRouterParams<ExecInServiceParams>): Promise<ExecInServiceResult> {
    const { result } = await this.callServiceHandler({ params, handlerType: "execInService" })
    return result
  }

  async getServiceLogs(params: ServiceActionRouterParams<GetServiceLogsParams>): Promise<GetServiceLogsResult> {
    const { result } = await this.callServiceHandler({
      params,
      handlerType: "getServiceLogs",
      defaultHandler: dummyLogStreamer,
    })
    return result
  }

  async runService(params: ServiceActionRouterParams<RunServiceParams>): Promise<RunResult> {
    const { result } = await this.callServiceHandler({ params, handlerType: "runService" })
    this.emitNamespaceEvent(result.namespaceStatus)
    return result
  }

  async getPortForward(params: ServiceActionRouterParams<GetPortForwardParams>) {
    const { result } = await this.callServiceHandler({ params, handlerType: "getPortForward" })
    return result
  }

  async stopPortForward(params: ServiceActionRouterParams<StopPortForwardParams>) {
    const { result } = await this.callServiceHandler({ params, handlerType: "stopPortForward" })
    return result
  }

  //endregion

  //===========================================================================
  //region Task Methods
  //===========================================================================

  async runTask(params: TaskActionRouterParams<Omit<RunTaskParams, "artifactsPath">>): Promise<RunTaskResult> {
    const actionUid = uuidv4()
    const tmpDir = await tmp.dir({ unsafeCleanup: true })
    const artifactsPath = normalizePath(await realpath(tmpDir.path))
    const taskName = params.task.name
    const moduleName = params.task.module.name
    const taskVersion = params.task.version
    const moduleVersion = params.task.module.version.versionString
    this.garden.events.emit("taskStatus", {
      taskName,
      moduleName,
      moduleVersion,
      taskVersion,
      actionUid,
      status: { state: "running", startedAt: new Date() },
    })

    params.events = params.events || new PluginEventBroker()

    try {
      // Annotate + emit log output
      params.events.on("log", ({ timestamp, data }) => {
        this.garden.events.emit("log", {
          timestamp,
          actionUid,
          entity: {
            type: "task",
            key: taskName,
            moduleName,
          },
          data: data.toString(),
        })
      })

      const { result } = await this.callTaskHandler({ params: { ...params, artifactsPath }, handlerType: "runTask" })

      // Emit status
      this.garden.events.emit("taskStatus", {
        taskName,
        moduleName,
        moduleVersion,
        taskVersion,
        actionUid,
        status: runStatus(result),
      })
      result && this.validateTaskOutputs(params.task, result)
      this.emitNamespaceEvent(result.namespaceStatus)

      return result
    } finally {
      // Copy everything from the temp directory, and then clean it up
      try {
        await copyArtifacts({
          garden: this.garden,
          log: params.log,
          artifactsPath,
          key: getArtifactKey("task", params.task.name, params.task.version),
        })
      } finally {
        await tmpDir.cleanup()
      }
    }
  }

  async getTaskResult(params: TaskActionRouterParams<GetTaskResultParams>): Promise<RunTaskResult | null | undefined> {
    const { result } = await this.callTaskHandler({
      params,
      handlerType: "getTaskResult",
      defaultHandler: async () => undefined,
    })
    this.garden.events.emit("taskStatus", {
      taskName: params.task.name,
      moduleName: params.task.module.name,
      taskVersion: params.task.version,
      moduleVersion: params.task.module.version.versionString,
      status: runStatus(result),
    })
    result && this.validateTaskOutputs(params.task, result)
    return result
  }

  private validateTaskOutputs(task: GardenTask, result: RunTaskResult) {
    const spec = this.moduleTypes[task.module.type]

    if (spec.taskOutputsSchema) {
      result.outputs = validateSchema(result.outputs, spec.taskOutputsSchema, {
        context: `outputs from task '${task.name}'`,
        ErrorClass: PluginError,
      })
    }

    for (const base of getModuleTypeBases(spec, this.moduleTypes)) {
      if (base.taskOutputsSchema) {
        result.outputs = validateSchema(result.outputs, base.taskOutputsSchema.unknown(true), {
          context: `outputs from task '${task.name}' (base schema from '${base.name}' plugin)`,
          ErrorClass: PluginError,
        })
      }
    }
  }

  //endregion

  //===========================================================================
  //region Helper Methods
  //===========================================================================

  async getServiceStatuses({
    log,
    graph,
    serviceNames,
  }: {
    log: LogEntry
    graph: ConfigGraph
    serviceNames?: string[]
  }): Promise<ServiceStatusMap> {
    const services = graph.getServices({ names: serviceNames })

    const tasks = services.map(
      (service) =>
        new GetServiceStatusTask({
          force: true,
          garden: this.garden,
          graph,
          log,
          service,
          devModeServiceNames: [],
        })
    )
    const results = await this.garden.processTasks(tasks, { throwOnError: true })

    return getServiceStatuses(results)
  }

  async deployMany({ graph, deployNames: serviceNames, force = false, forceBuild = false, log }: DeployManyParams) {
    const services = graph.getServices({ names: serviceNames })

    const tasks = services.map(
      (service) =>
        new DeployTask({
          garden: this.garden,
          log,
          graph,
          service,
          force,
          forceBuild,
          fromWatch: false,
          devModeServiceNames: [],
        })
    )

    return this.garden.processTasks(tasks)
  }

  /**
   * Deletes all or specified services in the environment.
   */
  async deleteServices(graph: ConfigGraph, log: LogEntry, names?: string[]) {
    const servicesLog = log.info({ msg: chalk.white("Deleting services..."), status: "active" })

    const services = graph.getServices({ names })

    const deleteResults = await this.garden.processTasks(
      services.map((service) => {
        return new DeleteServiceTask({
          garden: this.garden,
          graph,
          service,
          log: servicesLog,
          includeDependants: true,
        })
      })
    )

    const failed = Object.values(deleteResults).filter((r) => r && r.error).length

    if (failed) {
      throw new RuntimeError(`${failed} delete task(s) failed!`, {
        results: deleteResults,
      })
    }

    const serviceStatuses = deletedServiceStatuses(deleteResults)

    servicesLog.setSuccess()

    return serviceStatuses
  }

  //endregion

  private async callServiceHandler<T extends keyof ServiceActionHandlers>({
    params,
    handlerType,
    defaultHandler,
  }: {
    params: ServiceActionRouterParams<ServiceActionParams[T]>
    handlerType: T
    defaultHandler?: ServiceActionHandlers[T]
  }) {
    let { log, service, runtimeContext, graph } = params
    let module = service.module

    log.silly(`Getting ${handlerType} handler for service ${service.name}`)

    const handler = await this.getModuleHandler({
      moduleType: module.type,
      handlerType,
      pluginName: params.pluginName,
      defaultHandler: defaultHandler as ModuleAndRuntimeActionHandlers[T],
    })

    const providers = await this.garden.resolveProviders(log)

    const modules = graph.getModules()
    const templateContext = ModuleConfigContext.fromModule({
      garden: this.garden,
      resolvedProviders: providers,
      module,
      modules,
      runtimeContext,
      partialRuntimeResolution: false,
    })

    // Resolve ${runtime.*} template strings if needed.
    const runtimeContextIsEmpty = runtimeContext
      ? Object.keys(runtimeContext.envVars).length === 0 && runtimeContext.dependencies.length === 0
      : true

    if (!runtimeContextIsEmpty && getRuntimeTemplateReferences(module).length > 0) {
      log.silly(`Resolving runtime template strings for service '${service.name}'`)

      // Resolve the graph again (TODO: avoid this somehow!)
      graph = await this.garden.getConfigGraph({ log, runtimeContext, emit: false })

      // Resolve the service again
      service = graph.getService(service.name)
      module = service.module

      // Set allowPartial=false to ensure all required strings are resolved.
      service.config = resolveTemplateStrings(service.config, templateContext, { allowPartial: false })
    }

    const handlerParams = {
      ...(await this.commonParams(handler, log, templateContext, params.events)),
      ...params,
      service,
      module: omit(service.module, ["_config"]),
      runtimeContext,
    }

    log.silly(`Calling ${handlerType} handler for service ${service.name}`)

    return {
      handler,
      result: <ServiceActionOutputs[T]>await handler(<any>handlerParams),
    }
  }
}

type ModuleActionRouterParams<T extends PluginModuleActionParamsBase> = Omit<T, CommonParams> & {
  graph: ModuleGraph
  pluginName?: string
}

type ServiceActionRouterParams<T extends PluginServiceActionParamsBase> = Omit<T, "module" | CommonParams> & {
  graph: ConfigGraph
  pluginName?: string
}

type TaskActionRouterParams<T extends PluginTaskActionParamsBase> = Omit<T, "module" | CommonParams> & {
  graph: ConfigGraph
  pluginName?: string
}

const dummyLogStreamer = async ({ service, log }: GetServiceLogsParams) => {
  log.warn({
    section: service.name,
    msg: chalk.yellow(`No handler for log retrieval available for module type ${service.module.type}`),
  })
  return {}
}

const dummyDeleteServiceHandler = async ({ module, log }: DeleteServiceParams) => {
  const msg = `No delete service handler available for module type ${module.type}`
  log.setError(msg)
  return { state: "missing" as ServiceState, detail: {} }
}
