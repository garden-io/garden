/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

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
import {
  Module,
  TestSpec,
} from "./types/module"
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
} from "./types/plugin"
import {
  Service,
  ServiceContext,
  ServiceStatus,
} from "./types/service"
import Bluebird = require("bluebird")
import {
  mapValues,
  toPairs,
  values,
  padEnd,
} from "lodash"
import {
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

export type WrappedFromGarden = Pick<Garden,
  "projectName" |
  "projectRoot" |
  "log" |
  "config" |
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
  testModule: <T extends Module>(
    module: T, testName: string, testSpec: TestSpec, logEntry?: LogEntry,
  ) => Promise<TestResult>
  getTestResult: <T extends Module>(
    module: T, testName: string, version: TreeVersion, logEntry?: LogEntry,
  ) => Promise<TestResult | null>
  getEnvironmentStatus: () => Promise<EnvironmentStatusMap>
  configureEnvironment: () => Promise<EnvironmentStatusMap>
  destroyEnvironment: () => Promise<EnvironmentStatusMap>
  getServiceStatus: <T extends Module>(service: Service<T>) => Promise<ServiceStatus>
  deployService: <T extends Module>(
    service: Service<T>, serviceContext?: ServiceContext, logEntry?: LogEntry,
  ) => Promise<ServiceStatus>
  getServiceOutputs: <T extends Module>(service: Service<T>) => Promise<PrimitiveMap>
  execInService: <T extends Module>(service: Service<T>, command: string[]) => Promise<ExecInServiceResult>
  getServiceLogs: <T extends Module>(
    service: Service<T>, stream: Stream<ServiceLogEntry>, tail?: boolean,
  ) => Promise<void>
  getConfig: (key: string[]) => Promise<string>
  setConfig: (key: string[], value: string) => Promise<void>
  deleteConfig: (key: string[]) => Promise<DeleteConfigResult>

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

  // TODO: find a nicer way to do this (like a type-safe wrapper function)
  function commonParams(handler): PluginActionParamsBase {
    const providerName = handler["pluginName"]
    const providerConfig = projectConfig.providers[handler["pluginName"]]

    return {
      ctx,
      provider: {
        name: providerName,
        config: providerConfig,
      },
    }
  }

  const ctx: PluginContext = {
    projectName: garden.projectName,
    projectRoot: garden.projectRoot,
    log: garden.log,
    config: projectConfig,
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
      return handler({ ...commonParams(handler), module, logEntry })
    },

    buildModule: async <T extends Module>(module: T, buildContext: PrimitiveMap, logEntry?: LogEntry) => {
      await ctx.stageBuild(module)
      const defaultHandler = garden.getModuleActionHandler("buildModule", "generic")
      const handler = garden.getModuleActionHandler("buildModule", module.type, defaultHandler)
      return handler({ ...commonParams(handler), module, buildContext, logEntry })
    },

    stageBuild: async <T extends Module>(module: T) => {
      await garden.buildDir.syncDependencyProducts(ctx, module)
    },

    pushModule: async <T extends Module>(module: T, logEntry?: LogEntry) => {
      const handler = garden.getModuleActionHandler("pushModule", module.type, dummyPushHandler)
      return handler({ ...commonParams(handler), module, logEntry })
    },

    testModule: async <T extends Module>(module: T, testName: string, testSpec: TestSpec, logEntry?: LogEntry) => {
      const defaultHandler = garden.getModuleActionHandler("testModule", "generic")
      const handler = garden.getModuleActionHandler("testModule", module.type, defaultHandler)
      const env = garden.getEnvironment()
      return handler({ ...commonParams(handler), module, testName, testSpec, env, logEntry })
    },

    getTestResult: async <T extends Module>(
      module: T, testName: string, version: TreeVersion, logEntry?: LogEntry,
    ) => {
      const handler = garden.getModuleActionHandler("getTestResult", module.type, async () => null)
      const env = garden.getEnvironment()
      return handler({ ...commonParams(handler), module, testName, version, env, logEntry })
    },

    getEnvironmentStatus: async () => {
      const handlers = garden.getActionHandlers("getEnvironmentStatus")
      const env = garden.getEnvironment()
      return Bluebird.props(mapValues(handlers, h => h({ ...commonParams(h), env })))
    },

    configureEnvironment: async () => {
      const handlers = garden.getActionHandlers("configureEnvironment")
      const env = garden.getEnvironment()

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

        await handler({ ...commonParams(handler), status, env, logEntry })

        logEntry.setSuccess("Configured")
      })
      return ctx.getEnvironmentStatus()
    },

    destroyEnvironment: async () => {
      const handlers = garden.getActionHandlers("destroyEnvironment")
      const env = garden.getEnvironment()
      await Bluebird.each(values(handlers), h => h({ ...commonParams(h), env }))
      return ctx.getEnvironmentStatus()
    },

    getServiceStatus: async <T extends Module>(service: Service<T>) => {
      const handler = garden.getModuleActionHandler("getServiceStatus", service.module.type)
      return handler({ ...commonParams(handler), service, env: garden.getEnvironment() })
    },

    deployService: async <T extends Module>(
      service: Service<T>, serviceContext?: ServiceContext, logEntry?: LogEntry,
    ) => {
      const handler = garden.getModuleActionHandler("deployService", service.module.type)

      if (!serviceContext) {
        serviceContext = { envVars: {}, dependencies: {} }
      }

      return handler({ ...commonParams(handler), service, serviceContext, env: garden.getEnvironment(), logEntry })
    },

    getServiceOutputs: async <T extends Module>(service: Service<T>) => {
      // TODO: We might want to generally allow for "default handlers"
      let handler: ModuleActions<T>["getServiceOutputs"]
      try {
        handler = garden.getModuleActionHandler("getServiceOutputs", service.module.type)
      } catch (err) {
        return {}
      }
      return handler({ ...commonParams(handler), service, env: garden.getEnvironment() })
    },

    execInService: async <T extends Module>(service: Service<T>, command: string[]) => {
      const handler = garden.getModuleActionHandler("execInService", service.module.type)
      return handler({ ...commonParams(handler), service, command, env: garden.getEnvironment() })
    },

    getServiceLogs: async <T extends Module>(service: Service<T>, stream: Stream<ServiceLogEntry>, tail?: boolean) => {
      const handler = garden.getModuleActionHandler("getServiceLogs", service.module.type, dummyLogStreamer)
      return handler({ ...commonParams(handler), service, stream, tail, env: garden.getEnvironment() })
    },

    getConfig: async (key: string[]) => {
      garden.validateConfigKey(key)
      // TODO: allow specifying which provider to use for configs
      const handler = garden.getActionHandler("getConfig")
      const value = await handler({ ...commonParams(handler), key, env: garden.getEnvironment() })

      if (value === null) {
        throw new NotFoundError(`Could not find config key ${key}`, { key })
      } else {
        return value
      }
    },

    setConfig: async (key: string[], value: string) => {
      garden.validateConfigKey(key)
      const handler = garden.getActionHandler("setConfig")
      return handler({ ...commonParams(handler), key, value, env: garden.getEnvironment() })
    },

    deleteConfig: async (key: string[]) => {
      garden.validateConfigKey(key)
      const handler = garden.getActionHandler("deleteConfig")
      const res = await handler({ ...commonParams(handler), key, env: garden.getEnvironment() })

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

      const serviceStatus = await Bluebird.props(
        mapValues(services, (service: Service<any>) => ctx.getServiceStatus(service)),
      )

      return {
        providers: envStatus,
        services: serviceStatus,
      }
    },

    deployServices: async ({ names, force = false, forceBuild = false, logEntry }) => {
      const services = await ctx.getServices(names)

      for (const service of values(services)) {
        const task = new DeployTask(ctx, service, force, forceBuild, logEntry)
        await ctx.addTask(task)
      }

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
          ctx.log.info({ msg: `files changed for module ${changedModule.name}` })
          await handleChanges(changedModule)
          logErrors(await ctx.processTasks())
        })

      registerCleanupFunction("clearAutoReloadWatches", () => {
        ctx.log.info({ msg: "Clearing autoreload watches" })
        watcher.end()
      })

      while (true) {
        await sleep(1000)
      }
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
