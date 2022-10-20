/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { joi } from "../../../../src/config/common"
import { ManyActionTypeDefinitions } from "../../../../src/plugin/action-types"
import { createGardenPlugin, GardenPlugin } from "../../../../src/plugin/plugin"
import { createActionRouter } from "../../../../src/router/base"
import { projectRootA, expectError, makeTestGarden, TestGarden, getDefaultProjectConfig } from "../../../helpers"

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

  describe("callHandler", () => {})
})
