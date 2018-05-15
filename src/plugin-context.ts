/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import chalk from "chalk"
import { Stream } from "ts-stream"
import { NotFoundError } from "./exceptions"
import {
  Garden,
} from "./garden"
import {
  LogEntry,
} from "./logger"
import { EntryStyle } from "./logger/types"
import { TaskResults } from "./task-graph"
import { DeployTask } from "./tasks/deploy"
import {
  PrimitiveMap,
} from "./types/common"
import { Module } from "./types/module"
import {
  BuildResult,
  BuildStatus,
  DeleteConfigResult,
  EnvironmentStatusMap,
  ExecInServiceResult,
  GetServiceLogsParams,
  ModuleActionParams,
  PluginActionParams,
  PushModuleParams,
  PushResult,
  ServiceLogEntry,
  TestResult,
  ModuleActions,
  PluginActionParamsBase,
  LoginStatusMap,
  RunResult,
  TestModuleParams,
  RunModuleParams,
  RunServiceParams,
  Provider,
} from "./types/plugin"
import {
  RuntimeContext,
  Service,
  ServiceStatus,
} from "./types/service"
import {
  mapValues,
  toPairs,
  values,
  padEnd,
  keyBy,
} from "lodash"
import {
  Omit,
  registerCleanupFunction,
  sleep,
} from "./util"
import { TreeVersion } from "./vcs/base"
import {
  computeAutoReloadDependants,
  FSWatcher,
} from "./watch"

export type PluginContextGuard = {
  readonly [P in keyof (PluginActionParams | ModuleActionParams<any>)]: (...args: any[]) => Promise<any>
}

export interface ContextStatus {
  providers: EnvironmentStatusMap
  services: { [name: string]: ServiceStatus }
}

export type OmitBase<T extends PluginActionParamsBase> = Omit<T, keyof PluginActionParamsBase>

export type WrappedFromGarden = Pick<Garden,
  "projectName" |
  "projectRoot" |
  "log" |
  "config" |
  "localConfigStore" |
  "vcs" |
  "clearBuilds" |
  "getEnvironment" |
  "resolveModule" |
  "getModules" |
  "getModule" |
  "getServices" |
  "getService" |
  "getTemplateContext" |
  "addTask" |
  "processTasks">

export interface PluginContext extends PluginContextGuard, WrappedFromGarden {
  parseModule: <T extends Module>(moduleConfig: T["_ConfigType"]) => Promise<T>
  getModuleBuildPath: <T extends Module>(module: T) => Promise<string>
  getModuleBuildStatus: <T extends Module>(module: T, logEntry?: LogEntry) => Promise<BuildStatus>
  buildModule: <T extends Module>(
    module: T, buildContext: PrimitiveMap, logEntry?: LogEntry,
  ) => Promise<BuildResult>
  pushModule: <T extends Module>(module: T, logEntry?: LogEntry) => Promise<PushResult>
  runModule: <T extends Module>(params: OmitBase<RunModuleParams<T>>) => Promise<RunResult>,
  testModule: <T extends Module>(params: OmitBase<TestModuleParams<T>>) => Promise<TestResult>
  getTestResult: <T extends Module>(
    module: T, testName: string, version: TreeVersion, logEntry?: LogEntry,
  ) => Promise<TestResult | null>
  getEnvironmentStatus: () => Promise<EnvironmentStatusMap>
  configureEnvironment: () => Promise<EnvironmentStatusMap>
  destroyEnvironment: () => Promise<EnvironmentStatusMap>
  getServiceStatus: <T extends Module>(service: Service<T>) => Promise<ServiceStatus>
  deployService: <T extends Module>(service: Service<T>, logEntry?: LogEntry) => Promise<ServiceStatus>
  getServiceOutputs: <T extends Module>(service: Service<T>) => Promise<PrimitiveMap>
  execInService: <T extends Module>(service: Service<T>, command: string[]) => Promise<ExecInServiceResult>
  getServiceLogs: <T extends Module>(
    service: Service<T>, stream: Stream<ServiceLogEntry>, tail?: boolean,
  ) => Promise<void>
  runService: <T extends Module>(params: OmitBase<RunServiceParams<T>>) => Promise<RunResult>,
  getConfig: (key: string[]) => Promise<string>
  setConfig: (key: string[], value: string) => Promise<void>
  deleteConfig: (key: string[]) => Promise<DeleteConfigResult>
  getLoginStatus: () => Promise<LoginStatusMap>
  login: () => Promise<LoginStatusMap>
  logout: () => Promise<LoginStatusMap>

  stageBuild: <T extends Module>(module: T) => Promise<void>
  getStatus: () => Promise<ContextStatus>
  deployServices: (
    params: { names?: string[], force?: boolean, forceBuild?: boolean, logEntry?: LogEntry },
  ) => Promise<any>
  processModules: (
    modules: Module[], watch: boolean, process: (module: Module) => Promise<any>,
  ) => Promise<TaskResults>
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

  async function resolveModule<T extends Module>(handler, module: T): Promise<T> {
    const provider = <any>getProvider(handler)
    return module.resolveConfig({ provider })
  }

  async function resolveService<T extends Service>(handler, service: T, runtimeContext?: RuntimeContext): Promise<T> {
    const provider = <any>getProvider(handler)
    service.module = await resolveModule(handler, service.module)
    if (!runtimeContext) {
      runtimeContext = await service.prepareRuntimeContext()
    }
    return service.resolveConfig({ provider, ...runtimeContext })
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

    resolveModule: async <T extends Module = Module>(nameOrLocation: string) => {
      const module = await garden.resolveModule(nameOrLocation)
      return module ? <T>module : null
    },

    parseModule: async <T extends Module>(moduleConfig: T["_ConfigType"]) => {
      const handler = garden.getModuleActionHandler("parseModule", moduleConfig.type)
      return handler({ ...commonParams(handler), moduleConfig })
    },

    getModuleBuildStatus: async <T extends Module>(module: T, logEntry?: LogEntry) => {
      const defaultHandler = garden.getModuleActionHandler("getModuleBuildStatus", "generic")
      const handler = garden.getModuleActionHandler("getModuleBuildStatus", module.type, defaultHandler)
      module = await resolveModule(handler, module)
      return handler({ ...commonParams(handler), module, logEntry })
    },

    buildModule: async <T extends Module>(module: T, buildContext: PrimitiveMap, logEntry?: LogEntry) => {
      const defaultHandler = garden.getModuleActionHandler("buildModule", "generic")
      const handler = garden.getModuleActionHandler("buildModule", module.type, defaultHandler)
      module = await resolveModule(handler, module)
      await ctx.stageBuild(module)
      return handler({ ...commonParams(handler), module, buildContext, logEntry })
    },

    stageBuild: async <T extends Module>(module: T) => {
      await garden.buildDir.syncDependencyProducts(ctx, module)
    },

    pushModule: async <T extends Module>(module: T, logEntry?: LogEntry) => {
      const handler = garden.getModuleActionHandler("pushModule", module.type, dummyPushHandler)
      module = await resolveModule(handler, module)
      return handler({ ...commonParams(handler), module, logEntry })
    },

    runModule: async <T extends Module>(params: OmitBase<RunModuleParams<T>>) => {
      const handler = garden.getModuleActionHandler("runModule", params.module.type)
      params.module = await resolveModule(handler, params.module)
      return handler({ ...commonParams(handler), ...params })
    },

    testModule: async <T extends Module>(params: OmitBase<TestModuleParams<T>>) => {
      const module = params.module

      const defaultHandler = garden.getModuleActionHandler("testModule", "generic")
      const handler = garden.getModuleActionHandler("testModule", module.type, defaultHandler)
      params.module = await resolveModule(handler, params.module)

      return handler({ ...commonParams(handler), ...params })
    },

    getTestResult: async <T extends Module>(
      module: T, testName: string, version: TreeVersion, logEntry?: LogEntry,
    ) => {
      const handler = garden.getModuleActionHandler("getTestResult", module.type, async () => null)
      module = await resolveModule(handler, module)
      return handler({ ...commonParams(handler), module, testName, version, logEntry })
    },

    getEnvironmentStatus: async () => {
      const handlers = garden.getActionHandlers("getEnvironmentStatus")
      return Bluebird.props(mapValues(handlers, h => h({ ...commonParams(h) })))
    },

    configureEnvironment: async () => {
      const handlers = garden.getActionHandlers("configureEnvironment")

      const statuses = await ctx.getEnvironmentStatus()

      await Bluebird.each(toPairs(handlers), async ([name, handler]) => {
        const status = statuses[name] || { configured: false }

        if (status.configured) {
          return
        }

        const logEntry = garden.log.info({
          entryStyle: EntryStyle.activity,
          section: name,
          msg: "Configuring...",
        })

        await handler({ ...commonParams(handler), status, logEntry })

        logEntry.setSuccess("Configured")
      })
      return ctx.getEnvironmentStatus()
    },

    destroyEnvironment: async () => {
      const handlers = garden.getActionHandlers("destroyEnvironment")
      await Bluebird.each(values(handlers), h => h({ ...commonParams(h) }))
      return ctx.getEnvironmentStatus()
    },

    getServiceStatus: async <T extends Module>(service: Service<T>) => {
      const handler = garden.getModuleActionHandler("getServiceStatus", service.module.type)
      service = await resolveService(handler, service)
      return handler({ ...commonParams(handler), service })
    },

    deployService: async <T extends Module>(service: Service<T>, logEntry?: LogEntry) => {
      const handler = garden.getModuleActionHandler("deployService", service.module.type)

      const runtimeContext = await service.prepareRuntimeContext()
      service = await resolveService(handler, service, runtimeContext)

      return handler({ ...commonParams(handler), service, runtimeContext, logEntry })
    },

    getServiceOutputs: async <T extends Module>(service: Service<T>) => {
      // TODO: We might want to generally allow for "default handlers"
      let handler: ModuleActions<T>["getServiceOutputs"]
      try {
        handler = garden.getModuleActionHandler("getServiceOutputs", service.module.type)
      } catch (err) {
        return {}
      }
      service = await resolveService(handler, service)
      return handler({ ...commonParams(handler), service })
    },

    execInService: async <T extends Module>(service: Service<T>, command: string[]) => {
      const handler = garden.getModuleActionHandler("execInService", service.module.type)
      service = await resolveService(handler, service)
      return handler({ ...commonParams(handler), service, command })
    },

    getServiceLogs: async <T extends Module>(service: Service<T>, stream: Stream<ServiceLogEntry>, tail?: boolean) => {
      const handler = garden.getModuleActionHandler("getServiceLogs", service.module.type, dummyLogStreamer)
      service = await resolveService(handler, service)
      return handler({ ...commonParams(handler), service, stream, tail })
    },

    runService: async <T extends Module>(params: OmitBase<RunServiceParams<T>>) => {
      const handler = garden.getModuleActionHandler("runService", params.service.module.type)
      params.service = await resolveService(handler, params.service)
      return handler({ ...commonParams(handler), ...params })
    },

    getConfig: async (key: string[]) => {
      garden.validateConfigKey(key)
      // TODO: allow specifying which provider to use for configs
      const handler = garden.getActionHandler("getConfig")
      const value = await handler({ ...commonParams(handler), key })

      if (value === null) {
        throw new NotFoundError(`Could not find config key ${key}`, { key })
      } else {
        return value
      }
    },

    setConfig: async (key: string[], value: string) => {
      garden.validateConfigKey(key)
      const handler = garden.getActionHandler("setConfig")
      return handler({ ...commonParams(handler), key, value })
    },

    deleteConfig: async (key: string[]) => {
      garden.validateConfigKey(key)
      const handler = garden.getActionHandler("deleteConfig")
      const res = await handler({ ...commonParams(handler), key })

      if (!res.found) {
        throw new NotFoundError(`Could not find config key ${key}`, { key })
      } else {
        return res
      }

    },

    getModuleBuildPath: async <T extends Module>(module: T) => {
      return await garden.buildDir.buildPath(module)
    },

    getStatus: async () => {
      const envStatus: EnvironmentStatusMap = await ctx.getEnvironmentStatus()
      const services = await ctx.getServices()

      const serviceStatus = await Bluebird.map(
        services, (service: Service<any>) => ctx.getServiceStatus(service),
      )

      return {
        providers: envStatus,
        services: keyBy(serviceStatus, "name"),
      }
    },

    deployServices: async ({ names, force = false, forceBuild = false, logEntry }) => {
      const services = await ctx.getServices(names)

      await Bluebird.map(services, async (service) => {
        const task = await DeployTask.factory({ ctx, service, force, forceBuild, logEntry })
        await ctx.addTask(task)
      })

      return ctx.processTasks()
    },

    processModules: async (modules: Module[], watch: boolean, process: (module: Module) => Promise<any>) => {
      // TODO: log errors as they happen, instead of after processing all tasks
      const logErrors = (taskResults: TaskResults) => {
        for (const result of values(taskResults).filter(r => !!r.error)) {
          const divider = padEnd("", 80, "—")

          ctx.log.error(`\nFailed ${result.description}. Here is the output:`)
          ctx.log.error(divider)
          ctx.log.error(result.error + "")
          ctx.log.error(divider + "\n")
        }
      }

      for (const module of modules) {
        await process(module)
      }

      const results = await ctx.processTasks()
      logErrors(results)

      if (!watch) {
        return results
      }

      const autoReloadDependants = await computeAutoReloadDependants(modules)

      async function handleChanges(module: Module) {
        await process(module)

        const dependantsForModule = autoReloadDependants[module.name]
        if (!dependantsForModule) {
          return
        }

        for (const dependant of dependantsForModule) {
          await handleChanges(dependant)
        }
      }

      const watcher = new FSWatcher(ctx.projectRoot)

      // TODO: should the prefix here be different or set explicitly per run?
      await watcher.watchModules(modules, "addTasksForAutoReload/",
        async (changedModule) => {
          ctx.log.debug({ msg: `Files changed for module ${changedModule.name}` })
          await handleChanges(changedModule)
          logErrors(await ctx.processTasks())
        })

      registerCleanupFunction("clearAutoReloadWatches", () => {
        watcher.end()
        ctx.log.info({ msg: "\nDone!" })
      })

      while (true) {
        await sleep(1000)
      }
    },

    getLoginStatus: async () => {
      const handlers = garden.getActionHandlers("getLoginStatus")
      return Bluebird.props(mapValues(handlers, h => h({ ...commonParams(h) })))
    },

    login: async () => {
      const handlers = garden.getActionHandlers("login")
      await Bluebird.each(values(handlers), h => h({ ...commonParams(h) }))
      return ctx.getLoginStatus()
    },

    logout: async () => {
      const handlers = garden.getActionHandlers("logout")
      await Bluebird.each(values(handlers), h => h({ ...commonParams(h) }))
      return ctx.getLoginStatus()
    },

  }

  return ctx
}

const dummyLogStreamer = async ({ ctx, service }: GetServiceLogsParams) => {
  ctx.log.warn({
    section: service.name,
    msg: chalk.yellow(`No handler for log retrieval available for module type ${service.module.type}`),
  })
}

const dummyPushHandler = async ({ module }: PushModuleParams) => {
  return { pushed: false, message: chalk.yellow(`No push handler available for module type ${module.type}`) }
}
