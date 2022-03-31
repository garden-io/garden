/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")

import chalk from "chalk"
import { fromPairs, mapValues, omit, pickBy, keyBy, uniqBy } from "lodash"
import tmp from "tmp-promise"
import normalizePath = require("normalize-path")

import { PublishModuleParams, PublishModuleResult } from "./types/plugin/module/publishModule"
import { SetSecretParams, SetSecretResult } from "./types/plugin/provider/setSecret"
import { validateSchema } from "./config/validation"
import { defaultProvider } from "./config/provider"
import { ParameterError, PluginError, InternalError, RuntimeError } from "./exceptions"
import { Garden, ModuleActionMap } from "./garden"
import { LogEntry } from "./logger/log-entry"
import { GardenModule } from "./types/module"
import {
  NamespaceStatus,
  PluginActionContextParams,
  PluginActionParamsBase,
  PluginModuleActionParamsBase,
  PluginServiceActionParamsBase,
  PluginTaskActionParamsBase,
  RunResult,
  runStatus,
} from "./types/plugin/base"
import { BuildModuleParams, BuildResult, BuildState } from "./types/plugin/module/build"
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
  GardenPlugin,
  PluginMap,
  WrappedModuleActionHandler,
  WrappedActionHandler,
  ModuleTypeDefinition,
  getPluginActionNames,
  getModuleActionNames,
  getPluginActionDescriptions,
  getModuleActionDescriptions,
  PluginActionDescriptions,
  ModuleActionHandler,
  ActionHandler,
} from "./types/plugin/plugin"
import { CleanupEnvironmentParams, CleanupEnvironmentResult } from "./types/plugin/provider/cleanupEnvironment"
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
import { ServiceStatus, ServiceStatusMap, ServiceState, GardenService } from "./types/service"
import { Omit, getNames, uuidv4 } from "./util/util"
import { DebugInfoMap } from "./types/plugin/provider/getDebugInfo"
import { PrepareEnvironmentParams, PrepareEnvironmentResult } from "./types/plugin/provider/prepareEnvironment"
import { GetPortForwardParams } from "./types/plugin/service/getPortForward"
import { StopPortForwardParams } from "./types/plugin/service/stopPortForward"
import { emptyRuntimeContext, RuntimeContext } from "./runtime-context"
import { GetServiceStatusTask } from "./tasks/get-service-status"
import { getServiceStatuses } from "./tasks/base"
import { getRuntimeTemplateReferences, resolveTemplateStrings } from "./template-string/template-string"
import { getPluginBases, getPluginDependencies, getModuleTypeBases } from "./plugins"
import { ConfigureProviderParams, ConfigureProviderResult } from "./types/plugin/provider/configureProvider"
import { GardenTask } from "./types/task"
import { ConfigureModuleParams, ConfigureModuleResult } from "./types/plugin/module/configure"
import { PluginContext, PluginEventBroker } from "./plugin-context"
import { DeleteServiceTask, deletedServiceStatuses } from "./tasks/delete-service"
import { realpath, writeFile } from "fs-extra"
import { relative, join } from "path"
import { getArtifactKey } from "./util/artifacts"
import { AugmentGraphResult, AugmentGraphParams } from "./types/plugin/provider/augmentGraph"
import { DeployTask } from "./tasks/deploy"
import { BuildDependencyConfig } from "./config/module"
import { Profile } from "./util/profiling"
import { ConfigGraph } from "./config-graph"
import { ModuleConfigContext } from "./config/template-contexts/module"
import { GetDashboardPageParams, GetDashboardPageResult } from "./types/plugin/provider/getDashboardPage"
import { GetModuleOutputsParams, GetModuleOutputsResult } from "./types/plugin/module/getModuleOutputs"
import { ConfigContext } from "./config/template-contexts/base"

const maxArtifactLogLines = 5 // max number of artifacts to list in console after task+test runs

type TypeGuard = {
  readonly [P in keyof (PluginActionParams | ModuleActionParams<any>)]: (...args: any[]) => Promise<any>
}

export interface DeployServicesParams {
  graph: ConfigGraph
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
@Profile()
export class ActionRouter implements TypeGuard {
  private readonly actionHandlers: WrappedPluginActionMap
  private readonly moduleActionHandlers: ModuleActionMap
  private readonly loadedPlugins: PluginMap
  private readonly pluginActionDescriptions: PluginActionDescriptions
  private readonly moduleActionDescriptions: PluginActionDescriptions

  constructor(
    private readonly garden: Garden,
    configuredPlugins: GardenPlugin[],
    loadedPlugins: GardenPlugin[],
    private readonly moduleTypes: { [name: string]: ModuleTypeDefinition }
  ) {
    const pluginActionNames = getPluginActionNames()
    const moduleActionNames = getModuleActionNames()

    this.pluginActionDescriptions = getPluginActionDescriptions()
    this.moduleActionDescriptions = getModuleActionDescriptions()

    this.actionHandlers = <WrappedPluginActionMap>fromPairs(pluginActionNames.map((n) => [n, {}]))
    this.moduleActionHandlers = <WrappedModuleActionMap>fromPairs(moduleActionNames.map((n) => [n, {}]))
    this.loadedPlugins = keyBy(loadedPlugins, "name")

    garden.log.silly(`Creating ActionRouter with ${configuredPlugins.length} configured providers`)

    for (const plugin of configuredPlugins) {
      const handlers = plugin.handlers || {}

      for (const actionType of pluginActionNames) {
        const handler = handlers[actionType]
        handler && this.addActionHandler(plugin, actionType, handler)
      }

      for (const spec of plugin.createModuleTypes) {
        for (const actionType of moduleActionNames) {
          const handler = spec.handlers[actionType]
          handler && this.addModuleActionHandler(plugin, actionType, spec.name, handler)
        }
      }

      for (const spec of plugin.extendModuleTypes) {
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

  async configureProvider(params: ConfigureProviderParams & { pluginName: string }): Promise<ConfigureProviderResult> {
    const pluginName = params.pluginName

    this.garden.log.silly(`Calling 'configureProvider' handler on '${pluginName}'`)

    const handler = await this.getActionHandler({
      actionType: "configureProvider",
      pluginName,
      defaultHandler: async ({ config }) => ({ config }),
    })

    const handlerParams: PluginActionParams["configureProvider"] = {
      ...omit(params, ["pluginName"]),
      base: this.wrapBase(handler!.base),
    }

    const result = (<Function>handler)(handlerParams)

    this.garden.log.silly(`Called 'configureProvider' handler on '${pluginName}'`)

    return result
  }

  async augmentGraph(params: RequirePluginName<ActionRouterParams<AugmentGraphParams>>): Promise<AugmentGraphResult> {
    const { pluginName } = params

    return this.callActionHandler({
      actionType: "augmentGraph",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({ addRuntimeDependencies: [], addModules: [] }),
    })
  }

  async getEnvironmentStatus(
    params: RequirePluginName<ActionRouterParams<GetEnvironmentStatusParams>> & { ctx?: PluginContext }
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
    params: RequirePluginName<ActionRouterParams<PrepareEnvironmentParams>>
  ): Promise<PrepareEnvironmentResult> {
    const { pluginName } = params

    const res = await this.callActionHandler({
      actionType: "prepareEnvironment",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({ status: { ready: true, outputs: {} } }),
    })

    this.emitNamespaceEvents(res.status.namespaceStatuses)

    return res
  }

  async cleanupEnvironment(
    params: RequirePluginName<ActionRouterParams<CleanupEnvironmentParams>>
  ): Promise<CleanupEnvironmentResult> {
    const { pluginName } = params
    const res = await this.callActionHandler({
      actionType: "cleanupEnvironment",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({}),
    })

    this.emitNamespaceEvents(res.namespaceStatuses)

    return res
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

  async getDashboardPage(
    params: RequirePluginName<ActionRouterParams<GetDashboardPageParams>>
  ): Promise<GetDashboardPageResult> {
    const { pluginName } = params
    return this.callActionHandler({ actionType: "getDashboardPage", pluginName, params: omit(params, ["pluginName"]) })
  }

  //endregion

  //===========================================================================
  //region Module Actions
  //===========================================================================

  async configureModule<T extends GardenModule>(
    params: Omit<ConfigureModuleParams<T>, "ctx"> & { events?: PluginEventBroker }
  ): Promise<ConfigureModuleResult> {
    const { log, moduleConfig: config } = params
    const moduleType = config.type

    this.garden.log.silly(`Calling configure handler for ${moduleType} module '${config.name}'`)

    const handler = await this.getModuleActionHandler({
      actionType: "configure",
      moduleType,
      defaultHandler: async ({ moduleConfig }) => ({ moduleConfig }),
    })

    const handlerParams = {
      ...(await this.commonParams(handler, log, undefined, params.events)),
      ...params,
    }

    const result = await handler(<any>handlerParams)

    // Consolidate the configured build dependencies, in case there are duplicates
    const buildDeps: { [key: string]: BuildDependencyConfig } = {}

    for (const dep of result.moduleConfig.build.dependencies) {
      if (buildDeps[dep.name]) {
        buildDeps[dep.name].copy = uniqBy([...buildDeps[dep.name].copy, ...dep.copy], (c) => `${c.source}:${c.target}`)
      } else {
        buildDeps[dep.name] = dep
      }
    }
    result.moduleConfig.build.dependencies = Object.values(buildDeps)

    this.garden.log.silly(`Called configure handler for ${moduleType} module '${config.name}'`)

    return result
  }

  async getModuleOutputs<T extends GardenModule>(
    params: Omit<GetModuleOutputsParams<T>, "ctx"> & { events?: PluginEventBroker }
  ): Promise<GetModuleOutputsResult> {
    const { log, moduleConfig: config } = params
    const moduleType = config.type

    const handler = await this.getModuleActionHandler({
      actionType: "getModuleOutputs",
      moduleType,
      defaultHandler: async () => ({ outputs: {} }),
    })

    const handlerParams = {
      ...(await this.commonParams(handler, log, undefined, params.events)),
      ...params,
    }

    return handler(<any>handlerParams)
  }

  async getBuildStatus<T extends GardenModule>(
    params: ModuleActionRouterParams<GetBuildStatusParams<T>>
  ): Promise<BuildStatus> {
    const status = await this.callModuleHandler({
      params,
      actionType: "getBuildStatus",
      defaultHandler: async () => ({ ready: false }),
    })
    if (status.ready) {
      // Then an actual build won't take place, so we emit a build status event to that effect.
      this.garden.events.emit("buildStatus", {
        moduleName: params.module.name,
        moduleVersion: params.module.version.versionString,
        status: { state: "fetched" },
      })
    }
    return status
  }

  async build<T extends GardenModule>(params: ModuleActionRouterParams<BuildModuleParams<T>>): Promise<BuildResult> {
    const actionUid = uuidv4()
    params.events = params.events || new PluginEventBroker()
    let result: BuildResult
    const startedAt = new Date()
    const moduleName = params.module.name
    const moduleVersion = params.module.version.versionString
    params.events.on("log", ({ timestamp, data }) => {
      this.garden.events.emit("log", {
        timestamp,
        actionUid,
        entity: {
          type: "build",
          key: `${moduleName}`,
          moduleName,
        },
        data: data.toString(),
      })
    })
    this.garden.events.emit("buildStatus", {
      moduleName,
      moduleVersion,
      actionUid,
      status: { state: "building", startedAt },
    })

    const emitBuildStatusEvent = (state: BuildState) => {
      this.garden.events.emit("buildStatus", {
        moduleName,
        moduleVersion,
        actionUid,
        status: {
          state,
          startedAt,
          completedAt: new Date(),
        },
      })
    }

    try {
      result = await this.callModuleHandler({
        params,
        actionType: "build",
        defaultHandler: async () => ({}),
      })
      emitBuildStatusEvent("built")
    } catch (err) {
      emitBuildStatusEvent("failed")
      throw err
    }
    return result
  }

  async publishModule<T extends GardenModule>(
    params: ModuleActionRouterParams<PublishModuleParams<T>>
  ): Promise<PublishModuleResult> {
    return this.callModuleHandler({ params, actionType: "publish", defaultHandler: dummyPublishHandler })
  }

  async runModule<T extends GardenModule>(params: ModuleActionRouterParams<RunModuleParams<T>>): Promise<RunResult> {
    const result = await this.callModuleHandler({ params, actionType: "runModule" })
    this.emitNamespaceEvent(result.namespaceStatus)
    return result
  }

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

      const result = await this.callModuleHandler({ params: { ...params, artifactsPath }, actionType: "testModule" })

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
        await this.copyArtifacts(
          params.log,
          artifactsPath,
          getArtifactKey("test", params.test.name, params.test.version)
        )
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
      actionType: "getTestResult",
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
    const { result } = await this.callServiceHandler({ params, actionType: "getServiceStatus" })
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
    const { result } = await this.callServiceHandler({ params, actionType: "deployService" })
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

  async hotReloadService(params: ServiceActionRouterParams<HotReloadServiceParams>): Promise<HotReloadServiceResult> {
    const { result } = await this.callServiceHandler({ params, actionType: "hotReloadService" })
    return result
  }

  async deleteService(params: ServiceActionRouterParams<DeleteServiceParams>): Promise<ServiceStatus> {
    const log = params.log.info({
      section: params.service.name,
      msg: "Deleting...",
      status: "active",
    })

    const runtimeContext = emptyRuntimeContext
    const status = await this.getServiceStatus({
      ...params,
      runtimeContext,
      devMode: false,
      hotReload: false,
      localMode: false,
    })

    if (status.state === "missing") {
      log.setSuccess({
        section: params.service.name,
        msg: "Not found",
      })
      return status
    }

    const { result } = await this.callServiceHandler({
      params: { ...params, log },
      actionType: "deleteService",
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
    const { result } = await this.callServiceHandler({ params, actionType: "execInService" })
    return result
  }

  async getServiceLogs(params: ServiceActionRouterParams<GetServiceLogsParams>): Promise<GetServiceLogsResult> {
    const { result } = await this.callServiceHandler({
      params,
      actionType: "getServiceLogs",
      defaultHandler: dummyLogStreamer,
    })
    return result
  }

  async runService(params: ServiceActionRouterParams<RunServiceParams>): Promise<RunResult> {
    const { result } = await this.callServiceHandler({ params, actionType: "runService" })
    this.emitNamespaceEvent(result.namespaceStatus)
    return result
  }

  async getPortForward(params: ServiceActionRouterParams<GetPortForwardParams>) {
    const { result } = await this.callServiceHandler({ params, actionType: "getPortForward" })
    return result
  }

  async stopPortForward(params: ServiceActionRouterParams<StopPortForwardParams>) {
    const { result } = await this.callServiceHandler({ params, actionType: "stopPortForward" })
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

      const { result } = await this.callTaskHandler({ params: { ...params, artifactsPath }, actionType: "runTask" })

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
        await this.copyArtifacts(
          params.log,
          artifactsPath,
          getArtifactKey("task", params.task.name, params.task.version)
        )
      } finally {
        await tmpDir.cleanup()
      }
    }
  }

  async getTaskResult(params: TaskActionRouterParams<GetTaskResultParams>): Promise<RunTaskResult | null | undefined> {
    const { result } = await this.callTaskHandler({
      params,
      actionType: "getTaskResult",
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
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })
    )
    const results = await this.garden.processTasks(tasks, { throwOnError: true })

    return getServiceStatuses(results)
  }

  async deployServices({ graph, serviceNames, force = false, forceBuild = false, log }: DeployServicesParams) {
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
          hotReloadServiceNames: [],
          localModeServiceNames: [],
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

  /**
   * Runs cleanupEnvironment for all configured providers
   */
  async cleanupAll(log: LogEntry) {
    const envLog = log.info({ msg: chalk.white("Cleaning up environments..."), status: "active" })
    const environmentStatuses: EnvironmentStatusMap = {}

    const providers = await this.garden.resolveProviders(log)
    await Bluebird.each(Object.values(providers), async (provider) => {
      await this.cleanupEnvironment({ pluginName: provider.name, log: envLog })
      environmentStatuses[provider.name] = { ready: false, outputs: {} }
    })

    envLog.setSuccess()

    return environmentStatuses
  }

  async getDebugInfo({ log, includeProject }: { log: LogEntry; includeProject: boolean }): Promise<DebugInfoMap> {
    const handlers = await this.getActionHandlers("getDebugInfo")
    return Bluebird.props(mapValues(handlers, async (h) => h({ ...(await this.commonParams(h, log)), includeProject })))
  }

  //endregion

  /**
   * Copies the artifacts exported by a plugin handler to the user's artifact directory.
   *
   * @param log LogEntry
   * @param artifactsPath the temporary directory path given to the plugin handler
   */
  private async copyArtifacts(log: LogEntry, artifactsPath: string, key: string) {
    let files: string[] = []

    // Note: lazy-loading for startup performance
    const cpy = require("cpy")

    try {
      files = await cpy("**/*", this.garden.artifactsPath, { cwd: artifactsPath, parents: true })
    } catch (err) {
      // Ignore error thrown when the directory is empty
      if (err.name !== "CpyError" || !err.message.includes("the file doesn't exist")) {
        throw err
      }
    }

    const count = files.length

    if (count > 0) {
      // Log the exported artifact paths (but don't spam the console)
      if (count > maxArtifactLogLines) {
        files = files.slice(0, maxArtifactLogLines)
      }
      for (const file of files) {
        log.info(chalk.gray(`→ Artifact: ${relative(this.garden.projectRoot, file)}`))
      }
      if (count > maxArtifactLogLines) {
        log.info(chalk.gray(`→ Artifact: … plus ${count - maxArtifactLogLines} more files`))
      }
    }

    // Write list of files to a metadata file
    const metadataPath = join(this.garden.artifactsPath, `.metadata.${key}.json`)
    const metadata = {
      key,
      files: files.sort(),
    }
    await writeFile(metadataPath, JSON.stringify(metadata))

    return files
  }

  private emitNamespaceEvents(namespaceStatuses: NamespaceStatus[] | undefined) {
    if (namespaceStatuses && namespaceStatuses.length > 0) {
      for (const status of namespaceStatuses) {
        this.emitNamespaceEvent(status)
      }
    }
  }

  private emitNamespaceEvent(namespaceStatus: NamespaceStatus | undefined) {
    if (namespaceStatus) {
      const { pluginName, state, namespaceName } = namespaceStatus
      this.garden.events.emit("namespaceStatus", { pluginName, state, namespaceName })
    }
  }

  // TODO: find a nicer way to do this (like a type-safe wrapper function)
  private async commonParams(
    handler: WrappedActionHandler<any, any>,
    log: LogEntry,
    templateContext?: ConfigContext,
    events?: PluginEventBroker
  ): Promise<PluginActionParamsBase> {
    const provider = await this.garden.resolveProvider(log, handler.pluginName)

    return {
      ctx: await this.garden.getPluginContext(provider, templateContext, events),
      log,
      base: handler.base,
    }
  }

  // We special-case the configureProvider handlers and don't call them through this
  private async callActionHandler<T extends keyof Omit<WrappedPluginActionHandlers, "configureProvider">>({
    params,
    actionType,
    pluginName,
    defaultHandler,
  }: {
    params: ActionRouterParams<PluginActionParams[T]>
    actionType: T
    pluginName: string
    defaultHandler?: PluginActionHandlers[T]
  }): Promise<PluginActionOutputs[T]> {
    this.garden.log.silly(`Calling ${actionType} handler on plugin '${pluginName}'`)

    const handler = await this.getActionHandler({
      actionType,
      pluginName,
      defaultHandler,
    })

    const handlerParams: PluginActionParams[T] = {
      ...(await this.commonParams(handler!, params.log, undefined, params.events)),
      ...(<any>params),
    }

    const result = await (<Function>handler)(handlerParams)

    this.garden.log.silly(`Called ${actionType} handler on plugin '${pluginName}'`)

    return result
  }

  private async callModuleHandler<
    T extends keyof Omit<ModuleActionHandlers, "configure" | "getModuleOutputs" | "suggestModules">
  >({
    params,
    actionType,
    defaultHandler,
  }: {
    params: ModuleActionRouterParams<ModuleActionParams[T]>
    actionType: T
    defaultHandler?: ModuleActionHandlers[T]
  }): Promise<ModuleActionOutputs[T]> {
    const { module, pluginName, log, graph } = params

    log.silly(`Getting '${actionType}' handler for module '${module.name}' (type '${module.type}')`)

    const handler = await this.getModuleActionHandler({
      moduleType: module.type,
      actionType,
      pluginName,
      defaultHandler: defaultHandler as WrappedModuleAndRuntimeActionHandlers[T],
    })

    const providers = await this.garden.resolveProviders(log)
    const templateContext = ModuleConfigContext.fromModule({
      garden: this.garden,
      resolvedProviders: providers,
      module,
      modules: graph.getModules(),
      partialRuntimeResolution: false,
    })
    const handlerParams = {
      ...(await this.commonParams(handler, params.log, templateContext, params.events)),
      ...params,
      module: omit(module, ["_config"]),
    }

    log.silly(`Calling ${actionType} handler for module ${module.name}`)

    // TODO: figure out why this doesn't compile without the function cast
    return (<Function>handler)(handlerParams)
  }

  private async callServiceHandler<T extends keyof ServiceActionHandlers>({
    params,
    actionType,
    defaultHandler,
  }: {
    params: ServiceActionRouterParams<ServiceActionParams[T]>
    actionType: T
    defaultHandler?: ServiceActionHandlers[T]
  }) {
    let { log, service, runtimeContext, graph } = params
    let module = service.module

    log.silly(`Getting ${actionType} handler for service ${service.name}`)

    const handler = await this.getModuleActionHandler({
      moduleType: module.type,
      actionType,
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

    log.silly(`Calling ${actionType} handler for service ${service.name}`)

    return {
      handler,
      result: <ServiceActionOutputs[T]>await handler(<any>handlerParams),
    }
  }

  private async callTaskHandler<T extends keyof TaskActionHandlers>({
    params,
    actionType,
    defaultHandler,
  }: {
    params: TaskActionRouterParams<TaskActionParams[T]>
    actionType: T
    defaultHandler?: TaskActionHandlers[T]
  }) {
    let { task, log, graph } = params
    const runtimeContext = params["runtimeContext"] as RuntimeContext | undefined
    let module = task.module

    log.silly(`Getting ${actionType} handler for task ${module.name}.${task.name}`)

    const handler = await this.getModuleActionHandler({
      moduleType: module.type,
      actionType,
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
      log.silly(`Resolving runtime template strings for task '${task.name}'`)

      // Resolve the graph again (TODO: avoid this somehow!)
      graph = await this.garden.getConfigGraph({ log, runtimeContext, emit: false })

      // Resolve the task again
      task = graph.getTask(task.name)
      module = task.module

      // Set allowPartial=false to ensure all required strings are resolved.
      task.config = resolveTemplateStrings(task.config, templateContext, { allowPartial: false })
    }

    const handlerParams: any = {
      ...(await this.commonParams(handler, (<any>params).log, templateContext, params.events)),
      ...params,
      module: omit(task.module, ["_config"]),
      task,
    }

    log.silly(`Calling ${actionType} handler for task ${module.name}.${task.name}`)

    return {
      handler,
      result: <TaskActionOutputs[T]>await handler(<any>handlerParams),
    }
  }

  private addActionHandler<T extends keyof WrappedPluginActionHandlers>(
    plugin: GardenPlugin,
    actionType: T,
    handler: PluginActionHandlers[T]
  ) {
    const pluginName = plugin.name
    const schema = this.pluginActionDescriptions[actionType].resultSchema

    // Wrap the handler with identifying attributes
    const wrapped: WrappedPluginActionHandlers[T] = Object.assign(
      async (...args: any[]) => {
        const result = await handler.apply(plugin, args)
        if (result === undefined) {
          throw new PluginError(`Got empty response from ${actionType} handler on ${pluginName} provider`, {
            args,
            actionType,
            pluginName,
          })
        }
        return validateSchema(result, schema, { context: `${actionType} output from plugin ${pluginName}` })
      },
      { actionType, pluginName }
    )

    wrapped.base = this.wrapBase(handler.base)

    // I'm not sure why we need the cast here - JE
    const typeHandlers: any = this.actionHandlers[actionType]
    typeHandlers[pluginName] = wrapped
  }

  private addModuleActionHandler<T extends keyof ModuleActionHandlers>(
    plugin: GardenPlugin,
    actionType: T,
    moduleType: string,
    handler: ModuleActionHandlers[T]
  ) {
    const pluginName = plugin.name
    const schema = this.moduleActionDescriptions[actionType].resultSchema

    // Wrap the handler with identifying attributes
    const wrapped = Object.assign(
      <ModuleActionHandlers[T]>(async (...args: any[]) => {
        const result = await handler.apply(plugin, args)
        if (result === undefined) {
          throw new PluginError(
            `Got empty response from ${moduleType}.${actionType} handler on ${pluginName} provider`,
            {
              args,
              actionType,
              pluginName,
            }
          )
        }
        return validateSchema(result, schema, {
          context: `${actionType} ${moduleType} output from provider ${pluginName}`,
        })
      }),
      { actionType, pluginName, moduleType }
    )

    wrapped.base = this.wrapBase(handler.base)

    if (!this.moduleActionHandlers[actionType]) {
      this.moduleActionHandlers[actionType] = {}
    }

    if (!this.moduleActionHandlers[actionType][moduleType]) {
      // I'm not sure why we need the cast here - JE
      const handlers: any = this.moduleActionHandlers
      handlers[actionType][moduleType] = {}
    }

    this.moduleActionHandlers[actionType][moduleType][pluginName] = wrapped
  }

  /**
   * Recursively wraps the base handler (if any) on an action handler, such that the base handler receives the _next_
   * base handler as the `base` parameter when called from within the handler.
   */
  private wrapBase<T extends ActionHandler<any, any> | ModuleActionHandler<any, any>>(handler?: T): T | undefined {
    if (!handler) {
      return undefined
    }

    const base = this.wrapBase(handler.base)

    const wrapped = <T>Object.assign(
      async (params) => {
        // Override the base parameter, to recursively allow each base to call its base.
        return handler({ ...params, base })
      },
      { ...handler, base }
    )

    return wrapped
  }

  /**
   * Get a handler for the specified action.
   */
  private async getActionHandlers<T extends keyof WrappedPluginActionHandlers>(
    actionType: T,
    pluginName?: string
  ): Promise<WrappedActionHandlerMap<T>> {
    return this.filterActionHandlers(this.actionHandlers[actionType], pluginName)
  }

  /**
   * Get a handler for the specified module action.
   */
  private async getModuleActionHandlers<T extends keyof ModuleAndRuntimeActionHandlers>({
    actionType,
    moduleType,
    pluginName,
  }: {
    actionType: T
    moduleType: string
    pluginName?: string
  }): Promise<WrappedModuleActionHandlerMap<T>> {
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
  async getActionHandler<T extends keyof WrappedPluginActionHandlers>({
    actionType,
    pluginName,
    defaultHandler,
    throwIfMissing = true,
  }: {
    actionType: T
    pluginName: string
    defaultHandler?: PluginActionHandlers[T]
    throwIfMissing?: boolean
  }): Promise<WrappedPluginActionHandlers[T] | null> {
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
        { actionType, pluginName: defaultProvider.name }
      )
    }

    if (!throwIfMissing) {
      return null
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
        errorDetails
      )
    }
  }

  /**
   * Get the configured handler for the specified action.
   */
  async getModuleActionHandler<T extends keyof ModuleAndRuntimeActionHandlers>({
    actionType,
    moduleType,
    pluginName,
    defaultHandler,
  }: {
    actionType: T
    moduleType: string
    pluginName?: string
    defaultHandler?: ModuleAndRuntimeActionHandlers[T]
  }): Promise<WrappedModuleAndRuntimeActionHandlers[T]> {
    const handlers = Object.values(await this.getModuleActionHandlers({ actionType, moduleType, pluginName }))
    const spec = this.moduleTypes[moduleType]

    if (handlers.length === 0 && spec.base && !pluginName) {
      // No handler found but module type has a base. Check if the base type has the handler we're looking for.
      this.garden.log.silly(`No ${actionType} handler found for ${moduleType}. Trying ${spec.base} base.`)

      return this.getModuleActionHandler({
        actionType,
        moduleType: spec.base,
        defaultHandler,
      })
    } else if (handlers.length === 1) {
      // Nice and simple, just return the only applicable handler
      return handlers[0]
    } else if (handlers.length > 0) {
      // Multiple matches. We start by filtering down to "leaf nodes", i.e. handlers which are not being overridden
      // by other matched handlers.
      const filtered = handlers.filter((handler) => {
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
          for (const handler of filtered) {
            if (handler.pluginName === config.name) {
              return handler
            }
          }
        }

        // This should never happen
        throw new InternalError(
          `Unable to find any matching configuration when selecting ${moduleType}/${actionType} handler ` +
            `(please report this as a bug).`,
          { handlers, configs }
        )
      } else {
        return filtered[0]
      }
    } else if (defaultHandler) {
      // Return the default handler, but wrap it to match the expected interface.
      return Object.assign(<WrappedModuleAndRuntimeActionHandlers[T]>defaultHandler, {
        actionType,
        moduleType,
        pluginName: defaultProvider.name,
      })
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
          errorDetails
        )
      } else {
        throw new ParameterError(
          `No '${actionType}' handler configured for module type '${moduleType}' in environment ` +
            `'${this.garden.environmentName}'. Are you missing a provider configuration?`,
          errorDetails
        )
      }
    }
  }
}

type CommonParams = keyof PluginActionContextParams

type WrappedServiceActionHandlers<T extends GardenModule = GardenModule> = {
  [P in keyof ServiceActionParams<T>]: WrappedModuleActionHandler<ServiceActionParams<T>[P], ServiceActionOutputs[P]>
}

type WrappedTaskActionHandlers<T extends GardenModule = GardenModule> = {
  [P in keyof TaskActionParams<T>]: WrappedModuleActionHandler<TaskActionParams<T>[P], TaskActionOutputs[P]>
}

type WrappedModuleActionHandlers<T extends GardenModule = GardenModule> = {
  [P in keyof ModuleActionParams<T>]: WrappedModuleActionHandler<ModuleActionParams<T>[P], ModuleActionOutputs[P]>
}

type WrappedModuleAndRuntimeActionHandlers<T extends GardenModule = GardenModule> = WrappedModuleActionHandlers<T> &
  WrappedServiceActionHandlers<T> &
  WrappedTaskActionHandlers<T>

type WrappedPluginActionHandlers = {
  [P in keyof PluginActionParams]: WrappedActionHandler<PluginActionParams[P], PluginActionOutputs[P]>
}

interface WrappedActionHandlerMap<T extends keyof WrappedPluginActionHandlers> {
  [actionName: string]: WrappedPluginActionHandlers[T]
}

interface WrappedModuleActionHandlerMap<T extends keyof ModuleAndRuntimeActionHandlers> {
  [actionName: string]: WrappedModuleAndRuntimeActionHandlers[T]
}

type WrappedPluginActionMap = {
  [A in keyof WrappedPluginActionHandlers]: {
    [pluginName: string]: WrappedPluginActionHandlers[A]
  }
}

type WrappedModuleActionMap = {
  [A in keyof ModuleAndRuntimeActionHandlers]: {
    [moduleType: string]: {
      [pluginName: string]: WrappedModuleAndRuntimeActionHandlers[A]
    }
  }
}

// avoid having to specify common params on each action helper call
type ActionRouterParams<T extends PluginActionParamsBase> = Omit<T, CommonParams> & { pluginName?: string }

type ModuleActionRouterParams<T extends PluginModuleActionParamsBase> = Omit<T, CommonParams> & {
  graph: ConfigGraph
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
