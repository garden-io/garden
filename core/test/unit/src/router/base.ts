/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { cloneDeep } from "lodash"
import { ResolvedBuildAction } from "../../../../src/actions/build"
import { joi } from "../../../../src/config/common"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ManyActionTypeDefinitions } from "../../../../src/plugin/action-types"
import { createGardenPlugin, GardenPlugin } from "../../../../src/plugin/plugin"
import { createActionRouter } from "../../../../src/router/base"
import { projectRootA, expectError, makeTestGarden, TestGarden, getDefaultProjectConfig } from "../../../helpers"
import { getRouterTestData } from "./_helpers"

describe("BaseActionRouter", () => {
  const path = projectRootA
  const _testHandlerResult = {
    detail: {},
    outputs: {
      foo: "bar",
    },
    state: "ready" as "ready",
  }
  const now = new Date()
  const _testHandlers = {
    build: async () => _testHandlerResult,
    getStatus: async () => _testHandlerResult,
    publish: async () => ({ ..._testHandlerResult, detail: { published: true } }),
    run: async () => ({
      ..._testHandlerResult,
      completedAt: now,
      startedAt: now,
      success: true,
      log: "bla bla",
    }),
  }

  type DependenciesByName = string[]
  const actionTypesCfg = {
    Build: [
      {
        name: "test",
        docs: "",
        schema: joi.object(),
        handlers: {
          build: async () => _testHandlerResult,
        },
      },
    ],
  }
  const createTestPlugin = ({
    name,
    dependencies,
    actionTypesConfig = actionTypesCfg,
  }: {
    name: string
    dependencies: DependenciesByName
    actionTypesConfig?: Partial<ManyActionTypeDefinitions>
  }) => {
    return createGardenPlugin({
      name,
      dependencies: dependencies.map((dep) => ({ name: dep })),
      createActionTypes: actionTypesConfig,
    })
  }

  const createTestRouter = async (plugins: GardenPlugin[], garden?: TestGarden) => {
    if (!garden) {
      garden = await makeTestGarden(path, {
        plugins,
        noTempDir: true,
        onlySpecifiedPlugins: true,
        config: {
          ...getDefaultProjectConfig(),
          providers: plugins.map((p) => ({ name: p.name, dependencies: p.dependencies.map((d) => d.name) })),
        },
      })
    }
    return {
      garden,
      router: createActionRouter(
        "Build", // the action kind doesn't matter here, just picked randomly
        {
          garden,
          loadedPlugins: plugins,
          configuredPlugins: plugins,
        },
        _testHandlers
      ),
    }
  }

  describe("getHandler", () => {
    it("should return a handler for action- and handler type if one plugin provides it", async () => {
      const plugin = createTestPlugin({ name: "test-plugin", dependencies: [] })
      const { router } = await createTestRouter([plugin])

      const handler = await router.getHandler({
        handlerType: "build",
        actionType: "test",
      })

      expect(handler.handlerType).to.equal("build")
      expect(handler.actionType).to.equal("test")
      expect(handler.pluginName).to.equal(plugin.name)
    })

    it("should throw if no handler is available", async () => {
      const plugin = createTestPlugin({ name: "test-plugin", dependencies: [] })
      const { router } = await createTestRouter([plugin])

      await expectError(
        () =>
          router.getHandler({
            handlerType: "getOutputs",
            actionType: "test",
          }),
        "parameter"
      )
    })

    it("should return default handler if it's specified and no provider-defined handler is available", async () => {
      const defaultHandlerOutput = { outputs: { default: true } }
      const plugin = createTestPlugin({ name: "test-plugin", dependencies: [] })
      const { router } = await createTestRouter([plugin])
      const handler = await router.getHandler({
        handlerType: "getOutputs", // not specified on the test plugins
        actionType: "test",
        defaultHandler: async () => defaultHandlerOutput,
      })

      expect(handler.handlerType).to.equal("getOutputs")
      expect(handler.actionType).to.equal("test")
      expect(handler.pluginName).to.equal("_default")
      expect(await (handler as any)()).to.equal(defaultHandlerOutput, "it should return the defined default handler")
    })

    context("when no providers extend the action type with requested handler", () => {
      // TODO
      // tslint:disable-next-line: max-line-length
      // https://github.com/garden-io/garden/blob/bbe493b16baf35150e2a883bcb5613ef13d54dcd/core/test/unit/src/actions.ts#L1072
    })

    context("plugin extendActionTypes", () => {
      // TODO
    })

    context("when one provider overrides the requested handler on the action type", () => {
      it("should return the handler from the extending provider", async () => {
        const basePlugin = createTestPlugin({ name: "base", dependencies: [] })
        const extencionPlugin = createTestPlugin({ name: "extends", dependencies: ["base"] })
        const { router } = await createTestRouter([basePlugin, extencionPlugin])

        const handler = await router.getHandler({ handlerType: "build", actionType: "test" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.actionType).to.equal("test")
        expect(handler.pluginName).to.equal(extencionPlugin.name)
      })
    })

    context("when multiple providers override the requested handler on the action type", () => {
      it("should return the handler that is not being overridden by another handler", async () => {
        const basePlugin = createTestPlugin({ name: "base", dependencies: [] })
        const basePlugin2 = createTestPlugin({ name: "base-2", dependencies: ["base"] })
        const extencionPlugin = createTestPlugin({ name: "plugin-that-extends", dependencies: ["base-2"] })
        const { router } = await createTestRouter([basePlugin, basePlugin2, extencionPlugin])

        const handler = await router.getHandler({ handlerType: "build", actionType: "test" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.actionType).to.equal("test")
        expect(handler.pluginName).to.equal("plugin-that-extends")
      })

      context("when multiple providers are side by side in the dependency graph", () => {
        it("should return the last configured handler for the specified action type", async () => {
          const basePlugin = createTestPlugin({ name: "base", dependencies: [] })
          const extencionPlugin1 = createTestPlugin({ name: "extends-1", dependencies: ["base"] })
          const extencionPlugin2 = createTestPlugin({ name: "extends-2", dependencies: ["base"] })
          const { router } = await createTestRouter([basePlugin, extencionPlugin1, extencionPlugin2])

          const handler = await router.getHandler({ handlerType: "build", actionType: "test" })

          expect(handler.handlerType).to.equal("build")
          expect(handler.actionType).to.equal("test")
          expect(handler.pluginName).to.equal(extencionPlugin2.name)
        })
      })

      context("when the handler was added by a provider and not specified in the creating provider", () => {
        it("should return the added handler", async () => {
          const basePlugin = createTestPlugin({
            name: "base",
            dependencies: [],
            actionTypesConfig: {
              Build: [
                {
                  name: "test",
                  docs: "",
                  schema: joi.object(),
                  handlers: {}, // <-- has no handlers
                },
              ],
            },
          })
          const extencionPluginThatHasTheHandler = createTestPlugin({
            name: "extends",
            dependencies: ["base"],
            actionTypesConfig: {
              Build: [
                {
                  name: "test",
                  docs: "",
                  schema: joi.object(),
                  handlers: {
                    build: async () => _testHandlerResult,
                  },
                },
              ],
            },
          })

          const { router } = await createTestRouter([basePlugin, extencionPluginThatHasTheHandler])

          const handler = await router.getHandler({ handlerType: "build", actionType: "test" })

          expect(handler.handlerType).to.equal("build")
          expect(handler.actionType).to.equal("test")
          expect(handler.pluginName).to.equal(extencionPluginThatHasTheHandler.name)
        })
      })
    })

    context("when the action type has a base", () => {
      it("should return the handler for the specific action type, if available", async () => {
        const basePlugin = createTestPlugin({ name: "base", dependencies: [] })
        const plugin2 = createTestPlugin({
          name: "plugin2",
          // <- creates, not extends action type
          dependencies: ["base"],
          actionTypesConfig: {
            Build: [
              {
                name: "test-action-type-extenction",
                docs: "",
                base: "test", // <--
                schema: joi.object(),
                handlers: {
                  build: async () => _testHandlerResult,
                },
              },
            ],
          },
        })

        const { router } = await createTestRouter([basePlugin, plugin2])

        const handler = await router.getHandler({ handlerType: "build", actionType: "test-action-type-extenction" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.actionType).to.equal("test-action-type-extenction")
        expect(handler.pluginName).to.equal(plugin2.name)
      })

      it("should fall back on the base if no specific handler is available", async () => {
        const basePlugin = createTestPlugin({ name: "base", dependencies: [] })
        const plugin2 = createTestPlugin({
          name: "plugin2",
          // <- creates, not extends action type
          dependencies: ["base"],
          actionTypesConfig: {
            Build: [
              {
                name: "test-action-type-extenction",
                docs: "",
                base: "test", // <--
                schema: joi.object(),
                handlers: {}, // <-- no handlers defined
              },
            ],
          },
        })

        const { router } = await createTestRouter([basePlugin, plugin2])

        const handler = await router.getHandler({ handlerType: "build", actionType: "test-action-type-extenction" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.actionType).to.equal("test")
        expect(handler.pluginName).to.equal(basePlugin.name)
      })

      it("should recursively fall back on the base's bases if needed", async () => {
        const basePlugin = createTestPlugin({ name: "base", dependencies: [] })
        const basePlugin2 = createTestPlugin({
          name: "base-2",
          dependencies: ["base"],
          actionTypesConfig: {
            Build: [
              {
                name: "base-2",
                docs: "",
                base: "test", // <--
                schema: joi.object(),
                handlers: {}, // <-- no handlers defined
              },
            ],
          },
        })
        const plugin2 = createTestPlugin({
          name: "plugin2",
          // <- creates, not extends action type
          dependencies: ["base-2"],
          actionTypesConfig: {
            Build: [
              {
                name: "test-action-type-extenction",
                docs: "",
                base: "base-2", // <--
                schema: joi.object(),
                handlers: {}, // <-- no handlers defined
              },
            ],
          },
        })

        const { router } = await createTestRouter([basePlugin, basePlugin2, plugin2])

        const handler = await router.getHandler({ handlerType: "build", actionType: "test-action-type-extenction" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.actionType).to.equal("test")
        expect(handler.pluginName).to.equal(basePlugin.name)
      })
    })
  })

  describe("callHandler", () => {
    let garden: TestGarden
    let graph: ConfigGraph
    let log: LogEntry
    let resolvedBuildAction: ResolvedBuildAction
    let testPlugins: GardenPlugin[]

    before(async () => {
      const data = await getRouterTestData()
      garden = data.garden
      graph = data.graph
      log = data.log
      testPlugins = [data.plugins.basePlugin, data.plugins.testPluginA, data.plugins.testPluginB]
      resolvedBuildAction = data.resolvedBuildAction
    })

    // TODO: test in a better way
    // I'd love to write something better but there's no time.
    // Currently this router that's returned from the createTestRouter is a brand new instance
    // and does not have anyhing to do with the one already initiated in the garden instance.
    // That's quite confusing and it's necessary to know how the internals work to test all the things.
    // To clean up these tesks the base router logic itself has to be rewritten to be more testable.

    // The test-plugin-a build action getStatus handler is modded for these tests.

    it("should call the specified handler", async () => {
      const { router } = await createTestRouter(testPlugins, garden)

      const result = await router.callHandler({
        handlerType: "build",
        params: { graph, log, action: resolvedBuildAction, events: undefined },
      })

      expect(result.outputs.isTestPluginABuildActionBuildHandlerReturn).to.equal(true)
    })

    it("should should throw if the handler is not found", async () => {
      const { router } = await createTestRouter(testPlugins, garden)

      await expectError(
        () =>
          router.callHandler({
            handlerType: "getOutputs", // this handler type is not specified on the test plugins,
            params: { graph, log, action: resolvedBuildAction, events: undefined },
          }),
        { contains: "No 'getOutputs' handler configured for build type" }
      )
    })

    it("should call the handler with a base argument if the handler is overriding another", async () => {
      const { router } = await createTestRouter(testPlugins, garden)

      const result = await router.callHandler({
        handlerType: "getStatus",
        params: { graph, log, action: resolvedBuildAction, events: undefined },
      })

      expect(result.outputs.base).to.not.be.undefined
      expect(await result.outputs.base().outputs.plugin).to.equal("base")
    })

    it("should recursively override the base parameter when calling a base handler", async () => {
      throw "TODO-G2: write this test after the above is fixed"
    })

    it("should call the handler with the template context for the provider", async () => {
      const { router } = await createTestRouter(testPlugins, garden)

      const result = await router.callHandler({
        handlerType: "getStatus",
        params: { graph, log, action: resolvedBuildAction, events: undefined },
      })

      expect(result.outputs.resolvedEnvName).to.equal("default")
    })

    it("should call the handler with the template context for the action", async () => {
      const { router } = await createTestRouter(testPlugins, garden)

      const result = await router.callHandler({
        handlerType: "getStatus",
        params: { graph, log, action: resolvedBuildAction, events: undefined },
      })

      // TODO-G2: see test-plugin-a build getStatus handler comment
      expect(result.outputs.resolvedActionVersion).to.equal("a valid version string")
    })
  })

  describe("validateActionOutputs", () => {
    let graph: ConfigGraph
    let log: LogEntry
    let resolvedBuildAction: ResolvedBuildAction
    let testPlugins: GardenPlugin[]

    before(async () => {
      const data = await getRouterTestData()
      graph = data.graph
      log = data.log
      testPlugins = [data.plugins.basePlugin, data.plugins.testPluginA]
      resolvedBuildAction = data.resolvedBuildAction
    })

    it("validates static outputs", async () => {
      const { router } = await createTestRouter(testPlugins)

      await expectError(
        async () => await router.validateActionOutputs(resolvedBuildAction, "static", { staticKey: 123 }),
        {
          contains: ["Error validating static action outputs from Build", "key .staticKey must be a string."],
        }
      )
    })

    it("validates runtime outputs", async () => {
      const { router } = await createTestRouter(testPlugins)

      await expectError(async () => await router.validateActionOutputs(resolvedBuildAction, "runtime", { foo: 123 }), {
        contains: "Error validating runtime action outputs from Build 'module-a': key .foo must be a string.",
      })
    })

    it("throws if no schema is set and a key is set", async () => {
      throw "TODO"
    })

    it("validates against base schemas", async () => {
      const plugins = cloneDeep({ base: testPlugins[0], pluginA: testPlugins[1] })
      delete plugins.pluginA.createActionTypes.Build[0].runtimeOutputsSchema
      delete plugins.pluginA.createActionTypes.Build[0].staticOutputsSchema
      plugins.base.createActionTypes.Build[0].runtimeOutputsSchema = joi.object().keys({
        thisPropertyFromBaseMustBePresent: joi.number(),
      })
      const { router } = await createTestRouter([plugins.base, plugins.pluginA])

      await expectError(
        async () =>
          await router.validateActionOutputs(resolvedBuildAction, "runtime", {
            thisPropertyFromBaseMustBePresent: "this should be a number",
          }),
        {
          contains: "key .thispropertyfrombasemustbepresent must be a number",
        }
      )
    })
  })
})
