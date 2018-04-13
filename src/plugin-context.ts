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
  PluginActionParams,
  PluginActions,
  ServiceLogEntry,
  TestResult,
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
} from "lodash"

export type PluginContextGuard = {
  readonly [P in keyof PluginActionParams<any>]: (...args: any[]) => Promise<any>
}

export type WrappedFromGarden = Pick<Garden,
  "projectName" |
  "projectRoot" |
  "log" |
  "projectConfig" |
  "vcs" |
  "clearBuilds" |
  "getEnvironment" |
  "resolveModule" |
  "getModules" |
  "getServices" |
  "getService" |
  "getTemplateContext" |
  "addTask" |
  "processTasks">

export interface PluginContext extends PluginContextGuard, WrappedFromGarden {
  parseModule: <T extends Module>(config: T["_ConfigType"]) => Promise<T>
  getModuleBuildPath: <T extends Module>(module: T) => Promise<string>
  getModuleBuildStatus: <T extends Module>(module: T) => Promise<BuildStatus>
  buildModule: <T extends Module>(module: T, logEntry?: LogEntry) => Promise<BuildResult>
  testModule: <T extends Module>(module: T, testSpec: TestSpec, logEntry?: LogEntry) => Promise<TestResult>
  getTestResult: <T extends Module>(module: T, version: string, logEntry?: LogEntry) => Promise<TestResult | null>
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
}

export function createPluginContext(garden: Garden): PluginContext {
  function wrap(f) {
    return f.bind(garden)
  }

  const ctx: PluginContext = {
    projectName: garden.projectName,
    projectRoot: garden.projectRoot,
    log: garden.log,
    projectConfig: { ...garden.projectConfig },
    vcs: garden.vcs,

    // TODO: maybe we should move some of these here
    clearBuilds: wrap(garden.clearBuilds),
    getEnvironment: wrap(garden.getEnvironment),
    getModules: wrap(garden.getModules),
    getServices: wrap(garden.getServices),
    getService: wrap(garden.getService),
    getTemplateContext: wrap(garden.getTemplateContext),
    addTask: wrap(garden.addTask),
    processTasks: wrap(garden.processTasks),

    resolveModule: async <T extends Module = Module>(nameOrLocation: string) => {
      const module = await garden.resolveModule(nameOrLocation)
      return module ? <T>module : null
    },

    parseModule: async <T extends Module>(config: T["_ConfigType"]) => {
      const handler = garden.getActionHandler("parseModule", config.type)
      return handler({ ctx, config })
    },

    getModuleBuildPath: async <T extends Module>(module: T) => {
      return await garden.buildDir.buildPath(module)
    },

    getModuleBuildStatus: async <T extends Module>(module: T) => {
      const defaultHandler = garden.actionHandlers["getModuleBuildStatus"]["generic"]
      const handler = garden.getActionHandler("getModuleBuildStatus", module.type, defaultHandler)
      return handler({ ctx, module })
    },

    buildModule: async <T extends Module>(module: T, logEntry?: LogEntry) => {
      await garden.buildDir.syncDependencyProducts(module)
      const defaultHandler = garden.actionHandlers["buildModule"]["generic"]
      const handler = garden.getActionHandler("buildModule", module.type, defaultHandler)
      return handler({ ctx, module, logEntry })
    },

    testModule: async <T extends Module>(module: T, testSpec: TestSpec, logEntry?: LogEntry) => {
      const defaultHandler = garden.actionHandlers["testModule"]["generic"]
      const handler = garden.getEnvActionHandler("testModule", module.type, defaultHandler)
      const env = garden.getEnvironment()
      return handler({ ctx, module, testSpec, env, logEntry })
    },

    getTestResult: async <T extends Module>(module: T, version: string, logEntry?: LogEntry) => {
      const handler = garden.getEnvActionHandler("getTestResult", module.type, async () => null)
      const env = garden.getEnvironment()
      return handler({ ctx, module, version, env, logEntry })
    },

    getEnvironmentStatus: async () => {
      const handlers = garden.getEnvActionHandlers("getEnvironmentStatus")
      const env = garden.getEnvironment()
      return Bluebird.props(mapValues(handlers, h => h({ ctx, env })))
    },

    configureEnvironment: async () => {
      const handlers = garden.getEnvActionHandlers("configureEnvironment")
      const env = garden.getEnvironment()

      await Bluebird.each(toPairs(handlers), async ([name, handler]) => {
        const logEntry = garden.log.info({
          entryStyle: EntryStyle.activity,
          section: name,
          msg: "Configuring...",
        })

        await handler({ ctx, env, logEntry })

        logEntry.setSuccess("Configured")
      })
      return ctx.getEnvironmentStatus()
    },

    destroyEnvironment: async () => {
      const handlers = garden.getEnvActionHandlers("destroyEnvironment")
      const env = garden.getEnvironment()
      await Bluebird.each(values(handlers), h => h({ ctx, env }))
      return ctx.getEnvironmentStatus()
    },

    getServiceStatus: async <T extends Module>(service: Service<T>) => {
      const handler = garden.getEnvActionHandler("getServiceStatus", service.module.type)
      return handler({ ctx, service, env: garden.getEnvironment() })
    },

    deployService: async <T extends Module>(
      service: Service<T>, serviceContext?: ServiceContext, logEntry?: LogEntry,
    ) => {
      const handler = garden.getEnvActionHandler("deployService", service.module.type)

      if (!serviceContext) {
        serviceContext = { envVars: {}, dependencies: {} }
      }

      return handler({ ctx, service, serviceContext, env: garden.getEnvironment(), logEntry })
    },

    getServiceOutputs: async <T extends Module>(service: Service<T>) => {
      // TODO: We might want to generally allow for "default handlers"
      let handler: PluginActions<T>["getServiceOutputs"]
      try {
        handler = garden.getEnvActionHandler("getServiceOutputs", service.module.type)
      } catch (err) {
        return {}
      }
      return handler({ ctx, service, env: garden.getEnvironment() })
    },

    execInService: async <T extends Module>(service: Service<T>, command: string[]) => {
      const handler = garden.getEnvActionHandler("execInService", service.module.type)
      return handler({ ctx, service, command, env: garden.getEnvironment() })
    },

    getServiceLogs: async <T extends Module>(service: Service<T>, stream: Stream<ServiceLogEntry>, tail?: boolean) => {
      const handler = garden.getEnvActionHandler("getServiceLogs", service.module.type, dummyLogStreamer)
      return handler({ ctx, service, stream, tail, env: garden.getEnvironment() })
    },

    getConfig: async (key: string[]) => {
      garden.validateConfigKey(key)
      // TODO: allow specifying which provider to use for configs
      const handler = garden.getEnvActionHandler("getConfig")
      const value = await handler({ ctx, key, env: garden.getEnvironment() })

      if (value === null) {
        throw new NotFoundError(`Could not find config key ${key}`, { key })
      } else {
        return value
      }
    },

    setConfig: async (key: string[], value: string) => {
      garden.validateConfigKey(key)
      const handler = garden.getEnvActionHandler("setConfig")
      return handler({ ctx, key, value, env: garden.getEnvironment() })
    },

    deleteConfig: async (key: string[]) => {
      garden.validateConfigKey(key)
      const handler = garden.getEnvActionHandler("deleteConfig")
      const res = await handler({ ctx, key, env: garden.getEnvironment() })

      if (!res.found) {
        throw new NotFoundError(`Could not find config key ${key}`, { key })
      } else {
        return res
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
