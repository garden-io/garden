/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin, ActionHandler, ModuleActionHandler } from "../../../src/plugin/plugin"
import { ServiceState } from "../../../src/types/service"
import { projectRootA, TestGarden, makeTestGarden } from "../../helpers"
import { ActionRouter } from "../../../src/router/router"
import { LogEntry } from "../../../src/logger/log-entry"
import { expect } from "chai"
import { defaultNamespace } from "../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../src/constants"
import { defaultDotIgnoreFile } from "../../../src/util/fs"
import { ConfigGraph } from "../../../src/graph/config-graph"
import { ResolvedRunAction } from "../../../src/actions/run"
import { getRouterTestData } from "./router/_helpers"

describe("ActionRouter", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry
  let actionRouter: ActionRouter
  let resolvedRunAction: ResolvedRunAction

  before(async () => {
    const data = await getRouterTestData()
    garden = data.garden
    graph = data.graph
    log = data.log
    actionRouter = data.actionRouter
    resolvedRunAction = data.resolvedRunAction
  })

  after(async () => {
    await garden.close()
  })

  describe("callActionHandler", () => {
    it("should call the handler with a base argument if the handler is overriding another", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {})

      const base = Object.assign(
        async () => ({
          ready: true,
          outputs: {},
        }),
        { handlerType: "getEnvironmentStatus", pluginName: "base" }
      )

      const handler: ActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)

        return { ready: true, outputs: {} }
      }

      handler.base = base

      await emptyActions["callActionHandler"]({
        handlerType: "getEnvironmentStatus", // Doesn't matter which one it is
        pluginName: "test-plugin",
        params: {
          log,
        },
        defaultHandler: handler,
      })
    })

    it("should recursively override the base parameter when calling a base handler", async () => {
      const baseA = createGardenPlugin({
        name: "base-a",
        handlers: {
          getSecret: async (params) => {
            expect(params.base).to.not.exist
            return { value: params.key }
          },
        },
      })
      const baseB = createGardenPlugin({
        name: "base-b",
        base: "base-a",
        handlers: {
          getSecret: async (params) => {
            expect(params.base).to.exist
            expect(params.base!.base).to.not.exist
            return params.base!(params)
          },
        },
      })
      const foo = createGardenPlugin({
        name: "foo",
        base: "base-b",
        handlers: {
          getSecret: async (params) => {
            expect(params.base).to.exist
            expect(params.base!.base).to.exist
            return params.base!(params)
          },
        },
      })

      const path = projectRootA

      const _garden = await makeTestGarden(path, {
        plugins: [baseA, baseB, foo],
        config: {
          apiVersion: DEFAULT_API_VERSION,
          kind: "Project",
          name: "test",
          path,
          defaultEnvironment: "default",
          dotIgnoreFile: defaultDotIgnoreFile,
          environments: [{ name: "default", defaultNamespace, variables: {} }],
          providers: [{ name: "foo" }],
          variables: {},
        },
      })

      const _actions = await _garden.getActionRouter()

      const result = await _actions["callActionHandler"]({
        handlerType: "getSecret", // Doesn't matter which one it is
        pluginName: "foo",
        params: {
          key: "foo",
          log,
        },
      })

      expect(result).to.eql({ value: "foo" })
    })

    it("should call the handler with the template context for the provider", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {})

      const handler: ActionHandler<any, any> = async ({ ctx }) => {
        const resolved = ctx.resolveTemplateStrings("${environment.name}")
        return { ready: true, outputs: { resolved } }
      }

      const result = await emptyActions["callActionHandler"]({
        handlerType: "getEnvironmentStatus", // Doesn't matter which one it is
        pluginName: "test-plugin",
        params: {
          log,
        },
        defaultHandler: handler,
      })

      expect(result.outputs?.resolved).to.equal("default")
    })
  })

  describe("callModuleHandler", () => {
    it("should call the handler with a base argument if the handler is overriding another", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          needsBuild: true,
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const moduleA = graph.getModule("module-a")

      const base = Object.assign(
        async () => ({
          ready: true,
          outputs: {},
        }),
        { handlerType: "getBuildStatus", pluginName: "base", moduleType: "test" }
      )

      const handler: ModuleActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)
        return { ready: true, outputs: {} }
      }

      handler.base = base

      await emptyActions["callModuleHandler"]({
        handlerType: "getBuildStatus", // Doesn't matter which one it is
        params: {
          module: moduleA,
          log,
          graph,
        },
        defaultHandler: handler,
      })
    })

    it("should call the handler with the template context for the module", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          needsBuild: true,
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const moduleA = graph.getModule("module-a")
      const moduleB = graph.getModule("module-b")

      const handler: ModuleActionHandler<any, any> = async ({ ctx }) => {
        const resolved = ctx.resolveTemplateStrings("${modules.module-a.version}")
        return { ready: true, detail: { resolved } }
      }

      const result = await emptyActions["callModuleHandler"]({
        handlerType: "getBuildStatus", // Doesn't matter which one it is
        params: {
          module: moduleB,
          log,
          graph,
        },
        defaultHandler: handler,
      })

      expect(result.detail?.resolved).to.equal(moduleA.version.versionString)
    })
  })

  describe("callServiceHandler", () => {
    it("should call the handler with a base argument if the handler is overriding another", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          needsBuild: true,
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const deployServiceA = graph.getDeploy("service-a")

      const base = Object.assign(
        async () => ({
          forwardablePorts: [],
          state: <ServiceState>"ready",
          detail: {},
        }),
        { handlerType: "deployService", pluginName: "base", moduleType: "test" }
      )

      const handler: ModuleActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)
        return { forwardablePorts: [], state: <ServiceState>"ready", detail: {} }
      }

      handler.base = base

      await emptyActions["callServiceHandler"]({
        handlerType: "deployService", // Doesn't matter which one it is
        params: {
          service: deployServiceA,
          graph,
          log,
          devMode: false,
          localMode: false,
          force: false,
        },
        defaultHandler: handler,
      })
    })

    it("should call the handler with the template context for the service", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          needsBuild: true,
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const deployServiceA = graph.getDeploy("service-a")
      const deployServiceB = graph.getDeploy("service-b")

      const handler: ModuleActionHandler<any, any> = async ({ ctx }) => {
        const resolved = ctx.resolveTemplateStrings("${runtime.services.service-a.version}")
        return { forwardablePorts: [], state: <ServiceState>"ready", detail: { resolved } }
      }

      const { result } = await emptyActions["callServiceHandler"]({
        handlerType: "deployService", // Doesn't matter which one it is
        params: {
          service: deployServiceB,
          graph,
          log,
          devMode: false,

          localMode: false,
          force: false,
        },
        defaultHandler: handler,
      })

      expect(result.detail?.resolved).to.equal(deployServiceA.versionString())
    })
  })

  describe("callTaskHandler", () => {
    it("should call the handler with a base argument if the handler is overriding another", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          needsBuild: true,
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const runTaskA = graph.getRun("task-a")

      const base = Object.assign(
        async () => ({
          moduleName: "module-a",
          taskName: "task-a",
          command: [],
          outputs: { moo: "boo" },
          success: true,
          version: resolvedRunAction.versionString(),
          startedAt: new Date(),
          completedAt: new Date(),
          log: "boo",
        }),
        { handlerType: "runTask", pluginName: "base", moduleType: "test" }
      )

      const handler: ModuleActionHandler<any, any> = async (params) => {
        expect(params.base).to.equal(base)
        return {
          moduleName: "module-a",
          taskName: "task-a",
          command: [],
          outputs: { moo: "boo" },
          success: true,
          version: resolvedRunAction.versionString(),
          startedAt: new Date(),
          completedAt: new Date(),
          log: "boo",
        }
      }

      handler.base = base

      await emptyActions["callTaskHandler"]({
        handlerType: "runTask",
        params: {
          artifactsPath: "/tmp",
          task: runTaskA,
          graph,
          log,
          interactive: false,
        },
        defaultHandler: handler,
      })
    })

    it("should call the handler with the template context for the task", async () => {
      const emptyActions = new ActionRouter(garden, [], [], {
        test: {
          name: "test",
          docs: "test",
          needsBuild: true,
          handlers: {},
        },
      })

      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const runTaskA = graph.getRun("task-a")
      const deployServiceB = graph.getDeploy("service-b")

      const { result } = await emptyActions["callTaskHandler"]({
        handlerType: "runTask",
        params: {
          artifactsPath: "/tmp", // Not used in this test
          task: runTaskA,
          graph,
          log,
          interactive: false,
        },
        defaultHandler: async ({ ctx }) => {
          const resolved = ctx.resolveTemplateStrings("${runtime.services.service-b.version}")

          return {
            moduleName: "module-a",
            taskName: "task-a",
            command: [],
            outputs: { resolved },
            success: true,
            version: resolvedRunAction.versionString(),
            moduleVersion: resolvedRunAction.versionString(),
            startedAt: new Date(),
            completedAt: new Date(),
            log: "boo",
          }
        },
      })

      expect(result.outputs?.resolved).to.equal(deployServiceB.versionString())
    })
  })
})
