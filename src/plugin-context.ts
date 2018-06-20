/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import chalk from "chalk"
import {
  pathExists,
  readFile,
} from "fs-extra"
import { join } from "path"
import { CacheContext } from "./cache"
import { GARDEN_VERSIONFILE_NAME } from "./constants"
import { ConfigurationError } from "./exceptions"
import {
  Garden,
} from "./garden"
import { EntryStyle } from "./logger/types"
import {
  PrimitiveMap,
  validate,
} from "./types/common"
import {
  Module,
  versionFileSchema,
} from "./types/module"
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
} from "./types/plugin/params"
import {
  Service,
  ServiceStatus,
} from "./types/service"
import {
  mapValues,
  toPairs,
  values,
  keyBy,
  omit,
} from "lodash"
import {
  Omit,
} from "./util/util"
import { TreeVersion } from "./vcs/base"

export type PluginContextGuard = {
  readonly [P in keyof (PluginActionParams | ModuleActionParams<any>)]: (...args: any[]) => Promise<any>
}

export interface ContextStatus {
  providers: EnvironmentStatusMap
  services: { [name: string]: ServiceStatus }
}

export type PluginContextParams<T extends PluginActionParamsBase> = Omit<T, keyof PluginActionContextParams>
export type PluginContextModuleParams<T extends PluginModuleActionParamsBase> =
  Omit<T, "module" | keyof PluginActionContextParams> & { moduleName: string }
export type PluginContextServiceParams<T extends PluginServiceActionParamsBase> =
  Omit<T, "module" | "service" | keyof PluginActionContextParams> & { serviceName: string }

export type WrappedFromGarden = Pick<Garden,
  "projectName" |
  "projectRoot" |
  "log" |
  "config" |
  "localConfigStore" |
  "vcs" |
  "clearBuilds" |
  "getEnvironment" |
  "getModules" |
  "getModule" |
  "getServices" |
  "getService" |
  "getTemplateContext" |
  "addTask" |
  "processTasks">

export interface PluginContext extends PluginContextGuard, WrappedFromGarden {
  getEnvironmentStatus: (params: {}) => Promise<EnvironmentStatusMap>
  configureEnvironment: (params: { force?: boolean }) => Promise<EnvironmentStatusMap>
  destroyEnvironment: (params: {}) => Promise<EnvironmentStatusMap>
  getConfig: (params: PluginContextParams<GetConfigParams>) => Promise<GetConfigResult>
  setConfig: (params: PluginContextParams<SetConfigParams>) => Promise<SetConfigResult>
  deleteConfig: (params: PluginContextParams<DeleteConfigParams>) => Promise<DeleteConfigResult>
  getLoginStatus: (params: {}) => Promise<LoginStatusMap>
  login: (params: {}) => Promise<LoginStatusMap>
  logout: (params: {}) => Promise<LoginStatusMap>

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
  getModuleBuildPath: (moduleName: string) => Promise<string>
  getModuleVersion: (moduleName: string, force?: boolean) => Promise<TreeVersion>
  getLatestVersion: (versions: TreeVersion[]) => Promise<TreeVersion>
  stageBuild: (moduleName: string) => Promise<void>
  getStatus: () => Promise<ContextStatus>
}

export function createPluginContext(garden: Garden): PluginContext {
  function wrap(f) {
    return f.bind(garden)
  }

  const projectConfig = { ...garden.config }
  const providerConfigs = keyBy(projectConfig.providers, "name")

  function getProvider(handler): Provider {
    return {
      name: handler["pluginName"],
      config: providerConfigs[handler["pluginName"]],
    }
  }

  // TODO: find a nicer way to do this (like a type-safe wrapper function)
  function commonParams(handler): PluginActionParamsBase {
    return {
      ctx,
      env: garden.getEnvironment(),
      provider: getProvider(handler),
    }
  }

  async function getModuleAndHandler<T extends (keyof ModuleActions | keyof ServiceActions)>(
    moduleName: string, actionType: T, defaultHandler?: (ModuleActions & ServiceActions)[T],
  ): Promise<{ handler: (ModuleActions & ServiceActions)[T], module: Module }> {
    const module = await garden.getModule(moduleName)
    const handler = garden.getModuleActionHandler(actionType, module.type, defaultHandler)
    const provider = getProvider(handler)

    return {
      handler,
      module: await module.resolveConfig({ provider }),
    }
  }

  async function callModuleHandler<T extends keyof Omit<ModuleActions, "parseModule">>(
    params: PluginContextModuleParams<ModuleActionParams[T]>,
    actionType: T,
    defaultHandler?: ModuleActions[T],
  ): Promise<ModuleActionOutputs[T]> {
    const { module, handler } = await getModuleAndHandler(params.moduleName, actionType, defaultHandler)
    const handlerParams: ModuleActionParams[T] = {
      ...commonParams(handler),
      ...<object>omit(params, ["moduleName"]),
      module,
    }
    // TODO: figure out why this doesn't compile without the function cast
    return (<Function>handler)(handlerParams)
  }

  async function callServiceHandler<T extends keyof ServiceActions>(
    params: PluginContextServiceParams<ServiceActionParams[T]>, actionType: T, defaultHandler?: ServiceActions[T],
  ): Promise<ServiceActionOutputs[T]> {
    const service = await garden.getService(params.serviceName)

    const { module, handler } = await getModuleAndHandler(service.module.name, actionType, defaultHandler)
    service.module = module

    // TODO: figure out why this doesn't compile without the casts
    const runtimeContext = (<any>params).runtimeContext || await service.prepareRuntimeContext()
    const provider = getProvider(handler)

    const handlerParams: any = {
      ...commonParams(handler),
      ...<object>omit(params, ["moduleName"]),
      module,
      service: await service.resolveConfig({ provider, ...runtimeContext }),
    }

    return (<Function>handler)(handlerParams)
  }

  const ctx: PluginContext = {
    projectName: garden.projectName,
    projectRoot: garden.projectRoot,
    log: garden.log,
    config: projectConfig,
    localConfigStore: garden.localConfigStore,
    vcs: garden.vcs,

    // TODO: maybe we should move some of these here
    clearBuilds: wrap(garden.clearBuilds),
    getEnvironment: wrap(garden.getEnvironment),
    getModules: wrap(garden.getModules),
    getModule: wrap(garden.getModule),
    getServices: wrap(garden.getServices),
    getService: wrap(garden.getService),
    getTemplateContext: wrap(garden.getTemplateContext),
    addTask: wrap(garden.addTask),
    processTasks: wrap(garden.processTasks),

    //===========================================================================
    //region Environment Actions
    //===========================================================================

    getEnvironmentStatus: async () => {
      const handlers = garden.getActionHandlers("getEnvironmentStatus")
      return Bluebird.props(mapValues(handlers, h => h({ ...commonParams(h) })))
    },

    configureEnvironment: async ({ force = false }: { force?: boolean }) => {
      const handlers = garden.getActionHandlers("configureEnvironment")

      const statuses = await ctx.getEnvironmentStatus({})

      await Bluebird.each(toPairs(handlers), async ([name, handler]) => {
        const status = statuses[name] || { configured: false }

        if (status.configured && !force) {
          return
        }

        const logEntry = garden.log.info({
          entryStyle: EntryStyle.activity,
          section: name,
          msg: "Configuring...",
        })

        await handler({ ...commonParams(handler), force, status, logEntry })

        logEntry.setSuccess("Configured")
      })
      return ctx.getEnvironmentStatus({})
    },

    destroyEnvironment: async () => {
      const handlers = garden.getActionHandlers("destroyEnvironment")
      await Bluebird.each(values(handlers), h => h({ ...commonParams(h) }))
      return ctx.getEnvironmentStatus({})
    },

    getConfig: async ({ key }: PluginContextParams<GetConfigParams>) => {
      garden.validateConfigKey(key)
      // TODO: allow specifying which provider to use for configs
      const handler = garden.getActionHandler("getConfig")
      return handler({ ...commonParams(handler), key })
    },

    setConfig: async ({ key, value }: PluginContextParams<SetConfigParams>) => {
      garden.validateConfigKey(key)
      const handler = garden.getActionHandler("setConfig")
      return handler({ ...commonParams(handler), key, value })
    },

    deleteConfig: async ({ key }: PluginContextParams<DeleteConfigParams>) => {
      garden.validateConfigKey(key)
      const handler = garden.getActionHandler("deleteConfig")
      return handler({ ...commonParams(handler), key })
    },

    getLoginStatus: async () => {
      const handlers = garden.getActionHandlers("getLoginStatus")
      return Bluebird.props(mapValues(handlers, h => h({ ...commonParams(h) })))
    },

    login: async () => {
      const handlers = garden.getActionHandlers("login")
      await Bluebird.each(values(handlers), h => h({ ...commonParams(h) }))
      return ctx.getLoginStatus({})
    },

    logout: async () => {
      const handlers = garden.getActionHandlers("logout")
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
      const defaultHandler = garden.getModuleActionHandler("getModuleBuildStatus", "generic")
      return callModuleHandler(params, "getModuleBuildStatus", defaultHandler)
    },

    buildModule: async <T extends Module>(params: PluginContextModuleParams<BuildModuleParams<T>>) => {
      const defaultHandler = garden.getModuleActionHandler("buildModule", "generic")
      const { module, handler } = await getModuleAndHandler(params.moduleName, "buildModule", defaultHandler)
      await garden.buildDir.syncDependencyProducts(module)
      return handler({ ...commonParams(handler), module, logEntry: params.logEntry })
    },

    pushModule: async <T extends Module>(params: PluginContextModuleParams<PushModuleParams<T>>) => {
      return callModuleHandler(params, "pushModule", dummyPushHandler)
    },

    runModule: async <T extends Module>(params: PluginContextModuleParams<RunModuleParams<T>>) => {
      return callModuleHandler(params, "runModule")
    },

    testModule: async <T extends Module>(params: PluginContextModuleParams<TestModuleParams<T>>) => {
      const defaultHandler = garden.getModuleActionHandler("testModule", "generic")
      return callModuleHandler(params, "testModule", defaultHandler)
    },

    getTestResult: async <T extends Module>(params: PluginContextModuleParams<GetTestResultParams<T>>) => {
      return callModuleHandler(params, "getTestResult", async () => null)
    },

    //endregion

    //===========================================================================
    //region Service Actions
    //===========================================================================

    getServiceStatus: async (params: PluginContextServiceParams<GetServiceStatusParams>) => {
      return callServiceHandler(params, "getServiceStatus")
    },

    deployService: async (params: PluginContextServiceParams<DeployServiceParams>) => {
      return callServiceHandler(params, "deployService")
    },

    getServiceOutputs: async (params: PluginContextServiceParams<GetServiceOutputsParams>) => {
      return callServiceHandler(params, "getServiceOutputs", async () => ({}))
    },

    execInService: async (params: PluginContextServiceParams<ExecInServiceParams>) => {
      return callServiceHandler(params, "execInService")
    },

    getServiceLogs: async (params: PluginContextServiceParams<GetServiceLogsParams>) => {
      return callServiceHandler(params, "getServiceLogs", dummyLogStreamer)
    },

    runService: async (params: PluginContextServiceParams<RunServiceParams>) => {
      return callServiceHandler(params, "runService")
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

    getModuleBuildPath: async (moduleName: string) => {
      const module = await garden.getModule(moduleName)
      return await garden.buildDir.buildPath(module)
    },

    getModuleVersion: async (moduleName: string, force = false) => {
      const module = await ctx.getModule(moduleName)
      const cacheKey = ["moduleVersions", module.name]

      if (!force) {
        const cached = <TreeVersion>garden.cache.get(cacheKey)

        if (cached) {
          return cached
        }
      }

      const buildDependencies = await module.getBuildDependencies()
      const cacheContexts = buildDependencies.concat([module]).map(m => m.getCacheContext())

      const versionFilePath = join(module.path, GARDEN_VERSIONFILE_NAME)
      const versionFileContents = await pathExists(versionFilePath)
        && (await readFile(versionFilePath)).toString().trim()

      let version: TreeVersion

      if (!!versionFileContents) {
        // this is used internally to specify version outside of source control
        try {
          version = validate(JSON.parse(versionFileContents), versionFileSchema)
        } catch (err) {
          throw new ConfigurationError(
            `Unable to parse ${GARDEN_VERSIONFILE_NAME} as valid version file in module directory ${module.path}`,
            {
              modulePath: module.path,
              versionFilePath,
              versionFileContents,
            },
          )
        }
      } else {
        const treeVersion = await garden.vcs.getTreeVersion([module.path])

        const versionChain: TreeVersion[] = await Bluebird.map(
          buildDependencies,
          async (m: Module) => await m.getVersion(),
        )
        versionChain.push(treeVersion)

        // The module version is the latest of any of the dependency modules or itself.
        version = await ctx.getLatestVersion(versionChain)
      }

      garden.cache.set(cacheKey, version, ...cacheContexts)
      return version
    },

    getLatestVersion: async (versions: TreeVersion[]) => {
      const sortedVersions = await garden.vcs.sortVersions(versions)
      return sortedVersions[0]
    },

    getStatus: async () => {
      const envStatus: EnvironmentStatusMap = await ctx.getEnvironmentStatus({})
      const services = keyBy(await ctx.getServices(), "name")

      const serviceStatus = await Bluebird.props(mapValues(services,
        (service: Service<any>) => ctx.getServiceStatus({ serviceName: service.name }),
      ))

      return {
        providers: envStatus,
        services: serviceStatus,
      }
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
