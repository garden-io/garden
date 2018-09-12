/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import chalk from "chalk"
import { CacheContext } from "./cache"
import { Garden } from "./garden"
import { PrimitiveMap } from "./config/common"
import { Module } from "./types/module"
import {
  ModuleActions,
  Provider,
  ServiceActions,
} from "./types/plugin/plugin"
import {
  BuildResult,
  BuildStatus,
  DeleteConfigResult,
  EnvironmentStatusMap,
  ExecInServiceResult,
  GetConfigResult,
  GetServiceLogsResult,
  LoginStatusMap,
  ModuleActionOutputs,
  PushResult,
  RunResult,
  ServiceActionOutputs,
  SetConfigResult,
  TestResult,
} from "./types/plugin/outputs"
import {
  BuildModuleParams,
  DeleteConfigParams,
  DeployServiceParams,
  DeleteServiceParams,
  ExecInServiceParams,
  GetConfigParams,
  GetModuleBuildStatusParams,
  GetServiceLogsParams,
  GetServiceOutputsParams,
  GetServiceStatusParams,
  GetTestResultParams,
  ModuleActionParams,
  PluginActionContextParams,
  PluginActionParams,
  PluginActionParamsBase,
  PluginModuleActionParamsBase,
  PluginServiceActionParamsBase,
  PushModuleParams,
  RunModuleParams,
  RunServiceParams,
  ServiceActionParams,
  SetConfigParams,
  TestModuleParams,
  GetLoginStatusParams,
  LoginParams,
  LogoutParams,
  GetEnvironmentStatusParams,
  DestroyEnvironmentParams,
} from "./types/plugin/params"
import {
  Service,
  ServiceStatus,
  prepareRuntimeContext,
} from "./types/service"
import {
  mapValues,
  toPairs,
  values,
  keyBy,
  omit,
} from "lodash"
import { Omit } from "./util/util"
import { RuntimeContext } from "./types/service"
import { processServices, ProcessResults } from "./process"
import { getDeployTasks } from "./tasks/deploy"

export type PluginContextGuard = {
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

export type PluginContextParams<T extends PluginActionParamsBase> =
  Omit<T, keyof PluginActionContextParams> & { pluginName?: string }
export type PluginContextModuleParams<T extends PluginModuleActionParamsBase> =
  Omit<T, "module" | keyof PluginActionContextParams> & { moduleName: string, pluginName?: string }
export type PluginContextServiceParams<T extends PluginServiceActionParamsBase> =
  Omit<T, "module" | "service" | "runtimeContext" | keyof PluginActionContextParams>
  & { serviceName: string, runtimeContext?: RuntimeContext, pluginName?: string }

export type WrappedFromGarden = Pick<Garden,
  "projectName" |
  "projectRoot" |
  "projectSources" |
  "log" |
  "environmentConfig" |
  "localConfigStore" |
  "vcs" |
  "getEnvironment" |
  "getModules" |
  "getModule" |
  "getServices" |
  "getService" |
  "resolveModuleDependencies" |
  "resolveVersion"
  >

export interface PluginContext extends PluginContextGuard, WrappedFromGarden {
  providers: { [name: string]: Provider }

  getEnvironmentStatus: (params: PluginContextParams<GetEnvironmentStatusParams>) => Promise<EnvironmentStatusMap>
  configureEnvironment: (params: { force?: boolean, pluginName?: string }) => Promise<EnvironmentStatusMap>
  destroyEnvironment: (params: PluginContextParams<DestroyEnvironmentParams>) => Promise<EnvironmentStatusMap>
  getConfig: (params: PluginContextParams<GetConfigParams>) => Promise<GetConfigResult>
  setConfig: (params: PluginContextParams<SetConfigParams>) => Promise<SetConfigResult>
  deleteConfig: (params: PluginContextParams<DeleteConfigParams>) => Promise<DeleteConfigResult>
  getLoginStatus: (params: PluginContextParams<GetLoginStatusParams>) => Promise<LoginStatusMap>
  login: (params: PluginContextParams<LoginParams>) => Promise<LoginStatusMap>
  logout: (params: PluginContextParams<LogoutParams>) => Promise<LoginStatusMap>

  getModuleBuildStatus: <T extends Module>(params: PluginContextModuleParams<GetModuleBuildStatusParams<T>>)
    => Promise<BuildStatus>
  buildModule: <T extends Module>(params: PluginContextModuleParams<BuildModuleParams<T>>)
    => Promise<BuildResult>
  pushModule: <T extends Module>(params: PluginContextModuleParams<PushModuleParams<T>>)
    => Promise<PushResult>
  runModule: <T extends Module>(params: PluginContextModuleParams<RunModuleParams<T>>)
    => Promise<RunResult>,
  testModule: <T extends Module>(params: PluginContextModuleParams<TestModuleParams<T>>)
    => Promise<TestResult>
  getTestResult: <T extends Module>(params: PluginContextModuleParams<GetTestResultParams<T>>)
    => Promise<TestResult | null>

  getServiceStatus: <T extends Module>(params: PluginContextServiceParams<GetServiceStatusParams<T>>)
    => Promise<ServiceStatus>
  deployService: <T extends Module>(params: PluginContextServiceParams<DeployServiceParams<T>>)
    => Promise<ServiceStatus>
  deleteService: <T extends Module>(params: PluginContextServiceParams<DeleteServiceParams<T>>)
    => Promise<ServiceStatus>
  getServiceOutputs: <T extends Module>(params: PluginContextServiceParams<GetServiceOutputsParams<T>>)
    => Promise<PrimitiveMap>
  execInService: <T extends Module>(params: PluginContextServiceParams<ExecInServiceParams<T>>)
    => Promise<ExecInServiceResult>
  getServiceLogs: <T extends Module>(params: PluginContextServiceParams<GetServiceLogsParams<T>>)
    => Promise<GetServiceLogsResult>
  runService: <T extends Module>(params: PluginContextServiceParams<RunServiceParams<T>>)
    => Promise<RunResult>,

  invalidateCache: (context: CacheContext) => void
  invalidateCacheUp: (context: CacheContext) => void
  invalidateCacheDown: (context: CacheContext) => void
  stageBuild: (moduleName: string) => Promise<void>
  getStatus: () => Promise<ContextStatus>
  deployServices: (params: DeployServicesParams) => Promise<ProcessResults>
}

export function createPluginContext(garden: Garden): PluginContext {
  function wrap(f) {
    return f.bind(garden)
  }

  const projectConfig = { ...garden.environmentConfig }
  const providerConfigs = keyBy(projectConfig.providers, "name")
  const providers = mapValues(providerConfigs, (config, name) => ({
    name,
    config,
  }))

  function getProvider(handler): Provider {
    return providers[handler["pluginName"]]
  }

  // TODO: find a nicer way to do this (like a type-safe wrapper function)
  function commonParams(handler): PluginActionParamsBase {
    return {
      ctx: createPluginContext(garden),
      env: garden.getEnvironment(),
      provider: getProvider(handler),
    }
  }

  async function getModuleAndHandler<T extends (keyof ModuleActions | keyof ServiceActions)>(
    { moduleName, actionType, pluginName, defaultHandler }:
      { moduleName: string, actionType: T, pluginName?: string, defaultHandler?: (ModuleActions & ServiceActions)[T] },
  ): Promise<{ handler: (ModuleActions & ServiceActions)[T], module: Module }> {
    const module = await garden.getModule(moduleName)
    const handler = garden.getModuleActionHandler({
      actionType,
      moduleType: module.type,
      pluginName,
      defaultHandler,
    })

    return { handler, module }
  }

  async function callModuleHandler<T extends keyof Omit<ModuleActions, "parseModule">>(
    { params, actionType, defaultHandler }:
      { params: PluginContextModuleParams<ModuleActionParams[T]>, actionType: T, defaultHandler?: ModuleActions[T] },
  ): Promise<ModuleActionOutputs[T]> {
    const { moduleName, pluginName } = params
    const { module, handler } = await getModuleAndHandler({
      moduleName,
      actionType,
      pluginName,
      defaultHandler,
    })
    const handlerParams: ModuleActionParams[T] = {
      ...commonParams(handler),
      ...<object>omit(params, ["moduleName"]),
      module,
    }
    // TODO: figure out why this doesn't compile without the function cast
    return (<Function>handler)(handlerParams)
  }

  async function callServiceHandler<T extends keyof ServiceActions>(
    { params, actionType, defaultHandler }:
      { params: PluginContextServiceParams<ServiceActionParams[T]>, actionType: T, defaultHandler?: ServiceActions[T] },
  ): Promise<ServiceActionOutputs[T]> {
    const service = await garden.getService(params.serviceName)

    const { module, handler } = await getModuleAndHandler({
      moduleName: service.module.name,
      actionType,
      pluginName: params.pluginName,
      defaultHandler,
    })

    service.module = module

    // TODO: figure out why this doesn't compile without the casts
    const deps = await garden.getServices(service.config.dependencies)
    const runtimeContext = ((<any>params).runtimeContext || await prepareRuntimeContext(ctx, module, deps))

    const handlerParams: any = {
      ...commonParams(handler),
      ...<object>omit(params, ["moduleName"]),
      module,
      service,
      runtimeContext,
    }

    return (<Function>handler)(handlerParams)
  }

  const ctx: PluginContext = {
    projectName: garden.projectName,
    projectRoot: garden.projectRoot,
    projectSources: garden.projectSources,
    log: garden.log,
    environmentConfig: projectConfig,
    localConfigStore: garden.localConfigStore,
    vcs: garden.vcs,
    providers,

    getEnvironment: wrap(garden.getEnvironment),
    getModules: wrap(garden.getModules),
    getModule: wrap(garden.getModule),
    getServices: wrap(garden.getServices),
    getService: wrap(garden.getService),
    resolveModuleDependencies: wrap(garden.resolveModuleDependencies),
    resolveVersion: wrap(garden.resolveVersion),

    //===========================================================================
    //region Environment Actions
    //===========================================================================

    getEnvironmentStatus: async ({ pluginName }: PluginContextParams<GetEnvironmentStatusParams>) => {
      const handlers = garden.getActionHandlers("getEnvironmentStatus", pluginName)
      return Bluebird.props(mapValues(handlers, h => h({ ...commonParams(h) })))
    },

    configureEnvironment: async ({ force = false, pluginName }: { force?: boolean, pluginName?: string }) => {
      const handlers = garden.getActionHandlers("configureEnvironment", pluginName)

      const statuses = await ctx.getEnvironmentStatus({})

      await Bluebird.each(toPairs(handlers), async ([name, handler]) => {
        const status = statuses[name] || { configured: false }

        if (status.configured && !force) {
          return
        }

        const logEntry = garden.log.info({
          status: "active",
          section: name,
          msg: "Configuring...",
        })

        await handler({ ...commonParams(handler), force, status, logEntry })

        logEntry.setSuccess("Configured")
      })
      return ctx.getEnvironmentStatus({})
    },

    destroyEnvironment: async ({ pluginName }: PluginContextParams<DestroyEnvironmentParams>) => {
      const handlers = garden.getActionHandlers("destroyEnvironment", pluginName)
      await Bluebird.each(values(handlers), h => h({ ...commonParams(h) }))
      return ctx.getEnvironmentStatus({})
    },

    getConfig: async ({ key, pluginName }: PluginContextParams<GetConfigParams>) => {
      garden.validateConfigKey(key)
      // TODO: allow specifying which provider to use for configs
      const handler = garden.getActionHandler({ actionType: "getConfig", pluginName })
      return handler({ ...commonParams(handler), key })
    },

    setConfig: async ({ key, value, pluginName }: PluginContextParams<SetConfigParams>) => {
      garden.validateConfigKey(key)
      const handler = garden.getActionHandler({ actionType: "setConfig", pluginName })
      return handler({ ...commonParams(handler), key, value })
    },

    deleteConfig: async ({ key, pluginName }: PluginContextParams<DeleteConfigParams>) => {
      garden.validateConfigKey(key)
      const handler = garden.getActionHandler({ actionType: "deleteConfig", pluginName })
      return handler({ ...commonParams(handler), key })
    },

    getLoginStatus: async ({ pluginName }: PluginContextParams<GetLoginStatusParams>) => {
      const handlers = garden.getActionHandlers("getLoginStatus", pluginName)
      return Bluebird.props(mapValues(handlers, h => h({ ...commonParams(h) })))
    },

    login: async ({ pluginName }: PluginContextParams<LoginParams>) => {
      const handlers = garden.getActionHandlers("login", pluginName)
      await Bluebird.each(values(handlers), h => h({ ...commonParams(h) }))
      return ctx.getLoginStatus({})
    },

    logout: async ({ pluginName }: PluginContextParams<LogoutParams>) => {
      const handlers = garden.getActionHandlers("logout", pluginName)
      await Bluebird.each(values(handlers), h => h({ ...commonParams(h) }))
      return ctx.getLoginStatus({})
    },

    //endregion

    //===========================================================================
    //region Module Actions
    //===========================================================================

    getModuleBuildStatus: async <T extends Module>(
      params: PluginContextModuleParams<GetModuleBuildStatusParams<T>>,
    ) => {
      return callModuleHandler({
        params,
        actionType: "getModuleBuildStatus",
        defaultHandler: async () => ({ ready: false }),
      })
    },

    buildModule: async <T extends Module>(params: PluginContextModuleParams<BuildModuleParams<T>>) => {
      const module = await garden.getModule(params.moduleName)
      await garden.buildDir.syncDependencyProducts(module)
      return callModuleHandler({ params, actionType: "buildModule" })
    },

    pushModule: async <T extends Module>(params: PluginContextModuleParams<PushModuleParams<T>>) => {
      return callModuleHandler({ params, actionType: "pushModule", defaultHandler: dummyPushHandler })
    },

    runModule: async <T extends Module>(params: PluginContextModuleParams<RunModuleParams<T>>) => {
      return callModuleHandler({ params, actionType: "runModule" })
    },

    testModule: async <T extends Module>(params: PluginContextModuleParams<TestModuleParams<T>>) => {
      return callModuleHandler({ params, actionType: "testModule" })
    },

    getTestResult: async <T extends Module>(params: PluginContextModuleParams<GetTestResultParams<T>>) => {
      return callModuleHandler({
        params,
        actionType: "getTestResult",
        defaultHandler: async () => null,
      })
    },

    //endregion

    //===========================================================================
    //region Service Actions
    //===========================================================================

    getServiceStatus: async (params: PluginContextServiceParams<GetServiceStatusParams>) => {
      return callServiceHandler({ params, actionType: "getServiceStatus" })
    },

    deployService: async (params: PluginContextServiceParams<DeployServiceParams>) => {
      return callServiceHandler({ params, actionType: "deployService" })
    },

    deleteService: async (params: PluginContextServiceParams<DeleteServiceParams>) => {
      const logEntry = garden.log.info({
        section: params.serviceName,
        msg: "Deleting...",
        status: "active",
      })
      return callServiceHandler({
        params: { ...params, logEntry },
        actionType: "deleteService",
        defaultHandler: dummyDeleteServiceHandler,
      })
    },

    getServiceOutputs: async (params: PluginContextServiceParams<GetServiceOutputsParams>) => {
      return callServiceHandler({
        params,
        actionType: "getServiceOutputs",
        defaultHandler: async () => ({}),
      })
    },

    execInService: async (params: PluginContextServiceParams<ExecInServiceParams>) => {
      return callServiceHandler({ params, actionType: "execInService" })
    },

    getServiceLogs: async (params: PluginContextServiceParams<GetServiceLogsParams>) => {
      return callServiceHandler({ params, actionType: "getServiceLogs", defaultHandler: dummyLogStreamer })
    },

    runService: async (params: PluginContextServiceParams<RunServiceParams>) => {
      return callServiceHandler({ params, actionType: "runService" })
    },

    //endregion

    //===========================================================================
    //region Helper Methods
    //===========================================================================

    invalidateCache: (context: CacheContext) => {
      garden.cache.invalidate(context)
    },

    invalidateCacheUp: (context: CacheContext) => {
      garden.cache.invalidateUp(context)
    },

    invalidateCacheDown: (context: CacheContext) => {
      garden.cache.invalidateDown(context)
    },

    stageBuild: async (moduleName: string) => {
      const module = await garden.getModule(moduleName)
      await garden.buildDir.syncDependencyProducts(module)
    },

    getStatus: async () => {
      const envStatus: EnvironmentStatusMap = await ctx.getEnvironmentStatus({})
      const services = keyBy(await ctx.getServices(), "name")

      const serviceStatus = await Bluebird.props(mapValues(services, async (service: Service) => {
        const dependencies = await ctx.getServices(service.config.dependencies)
        const runtimeContext = await prepareRuntimeContext(ctx, service.module, dependencies)
        return ctx.getServiceStatus({ serviceName: service.name, runtimeContext })
      }))

      return {
        providers: envStatus,
        services: serviceStatus,
      }
    },

    deployServices: async ({ serviceNames, force = false, forceBuild = false }: DeployServicesParams) => {
      const services = await ctx.getServices(serviceNames)

      return processServices({
        services,
        garden,
        ctx,
        watch: false,
        handler: async (module) => getDeployTasks({
          ctx, module, serviceNames, force, forceBuild, includeDependants: false,
        }),
      })
    },

    //endregion
  }

  return ctx
}

const dummyLogStreamer = async ({ ctx, service }: GetServiceLogsParams) => {
  ctx.log.warn({
    section: service.name,
    msg: chalk.yellow(`No handler for log retrieval available for module type ${service.module.type}`),
  })
  return {}
}

const dummyPushHandler = async ({ module }: PushModuleParams) => {
  return { pushed: false, message: chalk.yellow(`No push handler available for module type ${module.type}`) }
}

const dummyDeleteServiceHandler = async ({ ctx, module, logEntry }: DeleteServiceParams) => {
  const msg = `No delete service handler available for module type ${module.type}`
  if (logEntry) {
    logEntry.setError(msg)
  } else {
    try {
      ctx.log.error(msg)
    } catch (err) {
      console.log("FAIL", err)
    }
  }
  return {}
}
