/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin, ActionHandler, ModuleActionHandler } from "../../../src/plugin/plugin"
import { ServiceState } from "../../../src/types/service"
import { expectError, makeTestGardenA, projectRootA, TestGarden, makeTestGarden } from "../../helpers"
import { ActionRouter } from "../../../src/router/router"
import { LogEntry } from "../../../src/logger/log-entry"
import { expect } from "chai"
import { joi } from "../../../src/config/common"
import { ProjectConfig, defaultNamespace } from "../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../src/constants"
import { defaultProvider, providerFromConfig } from "../../../src/config/provider"
import { defaultDotIgnoreFile } from "../../../src/util/fs"
import { DashboardPage } from "../../../src/plugin/handlers/provider/getDashboardPage"
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

  // Note: The test plugins below implicitly validate input params for each of the tests
  describe("environment actions", () => {
    describe("configureProvider", () => {
      it("should configure the provider", async () => {
        const config = { name: "test-plugin", foo: "bar", dependencies: [] }
        const result = await actionRouter.provider.configureProvider({
          ctx: await garden.getPluginContext(
            providerFromConfig({
              plugin: await garden.getPlugin("test-plugin"),
              config,
              dependencies: {},
              moduleConfigs: [],
              status: { ready: false, outputs: {} },
            })
          ),
          namespace: "default",
          environmentName: "default",
          pluginName: "test-plugin",
          log,
          config,
          configStore: garden.configStore,
          projectName: garden.projectName,
          projectRoot: garden.projectRoot,
          dependencies: {},
        })
        expect(result).to.eql({
          config,
          moduleConfigs: [],
        })
      })
    })

    describe("augmentGraph", () => {
      it("should return modules and/or dependency relations to add to the stack graph", async () => {
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const providers = await garden.resolveProviders(garden.log)
        const result = await actionRouter.provider.augmentGraph({
          log,
          pluginName: "test-plugin",
          actions: graph.getActions(),
          providers,
        })

        const name = "added-by-test-plugin"
        expect(result.addDependencies).to.eql([
          {
            by: {
              kind: "Deploy",
              name: "added-by-test-plugin",
            },
            on: {
              kind: "Build",
              name: "added-by-test-plugin",
            },
          },
        ])
        expect(result.addActions?.map((a) => ({ name: a.name, kind: a.kind }))).to.eql([
          {
            name: "added-by-test-plugin",
            kind: "Build",
          },
          {
            name: "added-by-test-plugin",
            kind: "Deploy",
          },
        ])
      })
    })

    describe("getDashboardPage", () => {
      it("should resolve the URL for a dashboard page", async () => {
        const page: DashboardPage = {
          name: "foo",
          title: "Foo",
          description: "foodefoodefoo",
          newWindow: false,
        }
        const result = await actionRouter.provider.getDashboardPage({ log, pluginName: "test-plugin", page })
        expect(result).to.eql({
          url: "http://foo",
        })
      })
    })

    describe("getEnvironmentStatus", () => {
      it("should return the environment status for a provider", async () => {
        const result = await actionRouter.provider.getEnvironmentStatus({ log, pluginName: "test-plugin" })
        expect(result).to.eql({
          ready: false,
          outputs: {},
        })
      })
    })

    describe("prepareEnvironment", () => {
      it("should prepare the environment for a configured provider", async () => {
        const result = await actionRouter.provider.prepareEnvironment({
          log,
          pluginName: "test-plugin",
          force: false,
          status: { ready: true, outputs: {} },
        })
        expect(result).to.eql({
          status: {
            ready: true,
            outputs: {},
          },
        })
      })
    })

    describe("cleanupEnvironment", () => {
      it("should clean up environment for a provider", async () => {
        const result = await actionRouter.provider.cleanupEnvironment({ log, pluginName: "test-plugin" })
        expect(result).to.eql({})
      })
    })

    describe("getSecret", () => {
      it("should retrieve a secret from the specified provider", async () => {
        const result = await actionRouter.provider.getSecret({ log, pluginName: "test-plugin", key: "foo" })
        expect(result).to.eql({ value: "foo" })
      })
    })

    describe("setSecret", () => {
      it("should set a secret via the specified provider", async () => {
        const result = await actionRouter.provider.setSecret({
          log,
          pluginName: "test-plugin",
          key: "foo",
          value: "boo",
        })
        expect(result).to.eql({})
      })
    })

    describe("deleteSecret", () => {
      it("should delete a secret from the specified provider", async () => {
        const result = await actionRouter.provider.deleteSecret({ log, pluginName: "test-plugin", key: "foo" })
        expect(result).to.eql({ found: true })
      })
    })
  })

  describe("getHandler", () => {
    const path = projectRootA

    it("should return the configured handler for specified action type and plugin name", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionRouter()
      const pluginName = "test-plugin-b"
      const handler = await actionsA.provider["getPluginHandler"]({ handlerType: "prepareEnvironment", pluginName })

      expect(handler!.handlerType).to.equal("prepareEnvironment")
      expect(handler!.pluginName).to.equal(pluginName)
    })

    it("should throw if no handler is available", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionRouter()
      const pluginName = "test-plugin-b"
      await expectError(
        () =>
          actionsA.provider["getPluginHandler"]({
            handlerType: "cleanupEnvironment",
            pluginName,
          }),
        "plugin"
      )
    })

    it("should return default handler, if specified and no handler is available", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionRouter()
      const defaultHandler = async () => {
        return { code: 0, output: "" }
      }
      const handler = await actionsA["getModuleHandler"]({
        handlerType: "execInService",
        moduleType: "container",
        defaultHandler,
      })
      expect(handler.handlerType).to.equal("execInService")
      expect(handler.moduleType).to.equal("container")
      expect(handler.pluginName).to.equal(defaultProvider.name)
    })

    it("should throw if no handler is available", async () => {
      const gardenA = await makeTestGardenA()
      const actionsA = await gardenA.getActionRouter()
      await expectError(
        () => actionsA["getModuleHandler"]({ handlerType: "execInService", moduleType: "container" }),
        "parameter"
      )
    })

    context("when no providers extend the module type with requested handler", () => {
      it("should return the handler from the provider that created it", async () => {
        const foo = createGardenPlugin({
          name: "foo",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              needsBuild: true,
              handlers: {
                // build: async () => ({}),
              },
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [foo],
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

        const handler = await _actions["getModuleHandler"]({ handlerType: "build", moduleType: "bar" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.moduleType).to.equal("bar")
        expect(handler.pluginName).to.equal("foo")
      })
    })

    context("when one provider overrides the requested handler on the module type", () => {
      it("should return the handler from the extending provider", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              needsBuild: true,
              handlers: {
                // build: async () => ({}),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base" }],
          extendModuleTypes: [
            {
              name: "bar",
              needsBuild: true,
              handlers: {
                // build: async () => ({}),
              },
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [base, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFile: defaultDotIgnoreFile,
            environments: [{ name: "default", defaultNamespace, variables: {} }],
            providers: [{ name: "base" }, { name: "foo" }],
            variables: {},
          },
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleHandler"]({ handlerType: "build", moduleType: "bar" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.moduleType).to.equal("bar")
        expect(handler.pluginName).to.equal("foo")
      })
    })

    context("when multiple providers extend the module type with requested handler", () => {
      it("should return the handler that is not being overridden by another handler", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              needsBuild: true,
              handlers: {
                // build: async () => ({}),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base" }],
          extendModuleTypes: [
            {
              name: "bar",
              needsBuild: true,
              handlers: {
                // build: async () => ({}),
              },
            },
          ],
        })
        const too = createGardenPlugin({
          name: "too",
          dependencies: [{ name: "base" }, { name: "foo" }],
          extendModuleTypes: [
            {
              name: "bar",
              needsBuild: true,
              handlers: {
                // build: async () => ({}),
              },
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [base, too, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFile: defaultDotIgnoreFile,
            environments: [{ name: "default", defaultNamespace, variables: {} }],
            providers: [
              { name: "base" },
              // The order here matters, to verify that the dependency ordering works
              { name: "too" },
              { name: "foo" },
            ],
            variables: {},
          },
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleHandler"]({ handlerType: "build", moduleType: "bar" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.moduleType).to.equal("bar")
        expect(handler.pluginName).to.equal("too")
      })

      context("when multiple providers are side by side in the dependency graph", () => {
        it("should return the last configured handler for the specified module action type", async () => {
          const base = createGardenPlugin({
            name: "base",
            createModuleTypes: [
              {
                name: "bar",
                docs: "bar",
                schema: joi.object(),
                needsBuild: true,
                handlers: {
                  // build: async () => ({}),
                },
              },
            ],
          })
          const foo = createGardenPlugin({
            name: "foo",
            dependencies: [{ name: "base" }],
            extendModuleTypes: [
              {
                name: "bar",
                needsBuild: true,
                handlers: {
                  // build: async () => ({}),
                },
              },
            ],
          })
          const too = createGardenPlugin({
            name: "too",
            dependencies: [{ name: "base" }],
            extendModuleTypes: [
              {
                name: "bar",
                needsBuild: true,
                handlers: {
                  // build: async () => ({}),
                },
              },
            ],
          })

          const _garden = await makeTestGarden(path, {
            plugins: [base, too, foo],
            config: {
              apiVersion: DEFAULT_API_VERSION,
              kind: "Project",
              name: "test",
              path,
              defaultEnvironment: "default",
              dotIgnoreFile: defaultDotIgnoreFile,
              environments: [{ name: "default", defaultNamespace, variables: {} }],
              providers: [
                { name: "base" },
                // The order here matters, since we use that as a "tie-breaker"
                { name: "foo" },
                { name: "too" },
              ],
              variables: {},
            },
          })

          const _actions = await _garden.getActionRouter()

          const handler = await _actions["getModuleHandler"]({ handlerType: "build", moduleType: "bar" })

          expect(handler.handlerType).to.equal("build")
          expect(handler.moduleType).to.equal("bar")
          expect(handler.pluginName).to.equal("too")
        })
      })
    })

    context("when the handler was added by a provider and not specified in the creating provider", () => {
      it("should return the added handler", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              needsBuild: true,
              handlers: {},
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base" }],
          extendModuleTypes: [
            {
              name: "bar",
              needsBuild: true,
              handlers: {
                // build: async () => ({}),
              },
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [base, foo],
          config: {
            apiVersion: DEFAULT_API_VERSION,
            kind: "Project",
            name: "test",
            path,
            defaultEnvironment: "default",
            dotIgnoreFile: defaultDotIgnoreFile,
            environments: [{ name: "default", defaultNamespace, variables: {} }],
            providers: [{ name: "base" }, { name: "foo" }],
            variables: {},
          },
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleHandler"]({ handlerType: "build", moduleType: "bar" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.moduleType).to.equal("bar")
        expect(handler.pluginName).to.equal("foo")
      })
    })

    context("when the module type has a base", () => {
      const projectConfigWithBase: ProjectConfig = {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "test",
        path,
        defaultEnvironment: "default",
        dotIgnoreFile: defaultDotIgnoreFile,
        environments: [{ name: "default", defaultNamespace, variables: {} }],
        providers: [{ name: "base" }, { name: "foo" }],
        variables: {},
      }

      it("should return the handler for the specific module type, if available", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              needsBuild: true,
              handlers: {
                // build: async () => ({}),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base" }],
          createModuleTypes: [
            {
              name: "moo",
              base: "bar",
              docs: "moo",
              schema: joi.object(),
              needsBuild: true,
              handlers: {
                // build: async () => ({}),
              },
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [base, foo],
          config: projectConfigWithBase,
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleHandler"]({ handlerType: "build", moduleType: "moo" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.moduleType).to.equal("moo")
        expect(handler.pluginName).to.equal("foo")
      })

      it("should fall back on the base if no specific handler is available", async () => {
        const base = createGardenPlugin({
          name: "base",
          createModuleTypes: [
            {
              name: "bar",
              docs: "bar",
              schema: joi.object(),
              needsBuild: true,
              handlers: {
                // build: async () => ({ buildLog: "base" }),
              },
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base" }],
          createModuleTypes: [
            {
              name: "moo",
              base: "bar",
              docs: "moo",
              schema: joi.object(),
              needsBuild: true,
              handlers: {},
            },
          ],
        })

        const _garden = await makeTestGarden(path, {
          plugins: [base, foo],
          config: projectConfigWithBase,
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleHandler"]({ handlerType: "build", moduleType: "moo" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.moduleType).to.equal("bar")
        expect(handler.pluginName).to.equal("base")
        expect(await handler(<any>{})).to.eql({ buildLog: "base" })
      })

      it("should recursively fall back on the base's bases if needed", async () => {
        const baseA = createGardenPlugin({
          name: "base-a",
          createModuleTypes: [
            {
              name: "base-a",
              docs: "base A",
              schema: joi.object(),
              needsBuild: true,
              handlers: {
                // build: async () => ({ buildLog: "base" }),
              },
            },
          ],
        })
        const baseB = createGardenPlugin({
          name: "base-b",
          dependencies: [{ name: "base-a" }],
          createModuleTypes: [
            {
              name: "base-b",
              base: "base-a",
              docs: "base B",
              schema: joi.object(),
              needsBuild: true,
              handlers: {},
            },
          ],
        })
        const foo = createGardenPlugin({
          name: "foo",
          dependencies: [{ name: "base-b" }],
          createModuleTypes: [
            {
              name: "moo",
              base: "base-b",
              docs: "moo",
              schema: joi.object(),
              needsBuild: true,
              handlers: {},
            },
          ],
        })

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
            providers: [{ name: "base-a" }, { name: "base-b" }, { name: "foo" }],
            variables: {},
          },
        })

        const _actions = await _garden.getActionRouter()

        const handler = await _actions["getModuleHandler"]({ handlerType: "build", moduleType: "moo" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.moduleType).to.equal("base-a")
        expect(handler.pluginName).to.equal("base-a")
        expect(await handler(<any>{})).to.eql({ buildLog: "base" })
      })
    })
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
