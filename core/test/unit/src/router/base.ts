/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import cloneDeep from "fast-copy"

import type { ResolvedBuildAction } from "../../../../src/actions/build.js"
import { joi } from "../../../../src/config/common.js"
import { resolveAction } from "../../../../src/graph/actions.js"
import type { BuildActionDefinition } from "../../../../src/plugin/action-types.js"
import type { GardenPluginSpec, PluginBuildActionParamsBase } from "../../../../src/plugin/plugin.js"
import { ACTION_RUNTIME_LOCAL, createGardenPlugin } from "../../../../src/plugin/plugin.js"
import type { ActionKindRouter } from "../../../../src/router/base.js"
import type { TestGarden } from "../../../helpers.js"
import { expectError, getDefaultProjectConfig, makeTempGarden } from "../../../helpers.js"
import { getRouterTestData } from "./_helpers.js"

describe("BaseActionRouter", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const testHandler = (params: PluginBuildActionParamsBase<any>) => {
    return {
      detail: {
        runtime: ACTION_RUNTIME_LOCAL,
      },
      outputs: {
        foo: "bar",
        base: {
          pluginName: params.base?.pluginName,
        },
        projectName: params.ctx.legacyResolveTemplateString("${project.name}"),
      },
      state: "ready" as const,
    }
  }

  const testBuildDefinition: BuildActionDefinition = {
    name: "test",
    docs: "Test Build definition",
    schema: joi.object(),
    runtimeOutputsSchema: joi.object().unknown(true),
    handlers: {
      build: async (params) => testHandler(params),
    },
  }

  const createTestRouter = async (plugins: GardenPluginSpec[], garden?: TestGarden) => {
    if (!garden) {
      const res = await makeTempGarden({
        plugins,
        onlySpecifiedPlugins: true,
        config: {
          ...getDefaultProjectConfig(),
          providers: plugins.map((p) => ({ name: p.name, dependencies: p.dependencies.map((d) => d.name) })),
        },
      })
      garden = res.garden
    }

    const router = await garden.getActionRouter()

    return {
      garden,
      // Note: The type is exposed differently on ActionRouter, but this is what is there
      router: router.build as ActionKindRouter<"Build">,
    }
  }

  describe("getHandler", () => {
    it("should return a handler for action- and handler type if one plugin provides it", async () => {
      const plugin = createGardenPlugin({
        name: "test-plugin",
        dependencies: [],
        createActionTypes: { Build: [testBuildDefinition] },
      })
      const { router } = await createTestRouter([plugin])

      const handler = router.getHandler({
        handlerType: "build",
        actionType: "test",
      })

      expect(handler.handlerType).to.equal("build")
      expect(handler.actionType).to.equal("test")
      expect(handler.pluginName).to.equal(plugin.name)
    })

    it("should throw if no handler is available", async () => {
      const plugin = createGardenPlugin({
        name: "test-plugin",
        dependencies: [],
        createActionTypes: { Build: [testBuildDefinition] },
      })
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
      const plugin = createGardenPlugin({
        name: "test-plugin",
        dependencies: [],
        createActionTypes: { Build: [testBuildDefinition] },
      })
      const { router } = await createTestRouter([plugin])
      const handler = router.getHandler({
        handlerType: "getOutputs", // not specified on the test plugins
        actionType: "test",
        defaultHandler: async () => defaultHandlerOutput,
      })

      expect(handler.handlerType).to.equal("getOutputs")
      expect(handler.actionType).to.equal("test")
      expect(handler.pluginName).to.equal("_default")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(await (handler as any)()).to.equal(defaultHandlerOutput, "it should return the defined default handler")
    })

    context("when no providers extend the action type with requested handler", () => {
      // TODO
      // https://github.com/garden-io/garden/blob/bbe493b16baf35150e2a883bcb5613ef13d54dcd/core/test/unit/src/actions.ts#L1072
    })

    context("plugin extendActionTypes", () => {
      // TODO
    })

    context("when one provider overrides the requested handler on the action type", () => {
      it("should return the handler from the extending provider", async () => {
        const basePlugin = createGardenPlugin({
          name: "base",
          dependencies: [],
          createActionTypes: { Build: [testBuildDefinition] },
        })
        const extensionPlugin = createGardenPlugin({
          name: "extends",
          dependencies: [{ name: "base" }],
          extendActionTypes: {
            Build: [
              {
                name: "test",
                handlers: {
                  build: async (params) => testHandler(params),
                },
              },
            ],
          },
        })
        const { router } = await createTestRouter([basePlugin, extensionPlugin])

        const handler = router.getHandler({ handlerType: "build", actionType: "test" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.actionType).to.equal("test")
        expect(handler.pluginName).to.equal(extensionPlugin.name)
      })
    })

    context("when multiple providers override the requested handler on the action type", () => {
      it("should return the handler that is not being overridden by another handler", async () => {
        const basePlugin = createGardenPlugin({
          name: "base",
          dependencies: [],
          createActionTypes: { Build: [testBuildDefinition] },
        })
        const basePlugin2 = createGardenPlugin({
          name: "base-2",
          dependencies: [{ name: "base" }],
          extendActionTypes: {
            Build: [
              {
                name: "test",
                handlers: {
                  build: async (params) => testHandler(params),
                },
              },
            ],
          },
        })
        const extensionPlugin = createGardenPlugin({
          name: "plugin-that-extends",
          dependencies: [{ name: "base-2" }],
          extendActionTypes: {
            Build: [
              {
                name: "test",
                handlers: {
                  build: async (params) => testHandler(params),
                },
              },
            ],
          },
        })
        const { router } = await createTestRouter([basePlugin, basePlugin2, extensionPlugin])

        const handler = router.getHandler({ handlerType: "build", actionType: "test" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.actionType).to.equal("test")
        expect(handler.pluginName).to.equal("plugin-that-extends")
      })

      context("when multiple providers are side by side in the dependency graph", () => {
        it("should return the last configured handler for the specified action type", async () => {
          const basePlugin = createGardenPlugin({
            name: "base",
            dependencies: [],
            createActionTypes: { Build: [testBuildDefinition] },
          })
          const extensionPlugin1 = createGardenPlugin({
            name: "extends-1",
            dependencies: [{ name: "base" }],
            extendActionTypes: {
              Build: [
                {
                  name: "test",
                  handlers: {
                    build: async (params) => testHandler(params),
                  },
                },
              ],
            },
          })
          const extensionPlugin2 = createGardenPlugin({
            name: "extends-2",
            dependencies: [{ name: "base" }],
            extendActionTypes: {
              Build: [
                {
                  name: "test",
                  handlers: {
                    build: async (params) => testHandler(params),
                  },
                },
              ],
            },
          })
          const { router } = await createTestRouter([basePlugin, extensionPlugin1, extensionPlugin2])

          const handler = router.getHandler({ handlerType: "build", actionType: "test" })

          expect(handler.handlerType).to.equal("build")
          expect(handler.actionType).to.equal("test")
          expect(handler.pluginName).to.equal(extensionPlugin2.name)
        })
      })

      context("when the handler was added by a provider and not specified in the creating provider", () => {
        it("should return the added handler", async () => {
          const basePlugin = createGardenPlugin({
            name: "base",
            dependencies: [],
            createActionTypes: {
              Build: [
                {
                  name: "test",
                  docs: "base",
                  schema: joi.object(),
                  handlers: {}, // <-- has no handlers
                },
              ],
            },
          })
          const extensionPluginThatHasTheHandler = createGardenPlugin({
            name: "extends",
            dependencies: [{ name: "base" }],
            extendActionTypes: {
              Build: [
                {
                  name: "test",
                  handlers: {
                    build: async (params) => testHandler(params),
                  },
                },
              ],
            },
          })

          const { router } = await createTestRouter([basePlugin, extensionPluginThatHasTheHandler])

          const handler = router.getHandler({ handlerType: "build", actionType: "test" })

          expect(handler.handlerType).to.equal("build")
          expect(handler.actionType).to.equal("test")
          expect(handler.pluginName).to.equal(extensionPluginThatHasTheHandler.name)
        })
      })
    })

    context("when the action type has a base", () => {
      it("attaches the base handler", async () => {
        const basePlugin = createGardenPlugin({
          name: "base",
          dependencies: [],
          createActionTypes: { Build: [testBuildDefinition] },
        })
        const plugin2 = createGardenPlugin({
          name: "plugin2",
          dependencies: [{ name: "base" }],
          createActionTypes: {
            Build: [
              {
                name: "test-action-type-extension",
                docs: "extension",
                base: "test", // <--
                schema: joi.object(),
                handlers: {
                  build: async (params) => testHandler(params),
                },
              },
            ],
          },
        })

        const { router } = await createTestRouter([basePlugin, plugin2])

        const handler = router.getHandler({ handlerType: "build", actionType: "test-action-type-extension" })

        expect(handler.base).to.exist
      })

      it("should return the handler for the specific action type, if available", async () => {
        const basePlugin = createGardenPlugin({
          name: "base",
          dependencies: [],
          createActionTypes: { Build: [testBuildDefinition] },
        })
        const plugin2 = createGardenPlugin({
          name: "plugin2",
          // <- creates, not extends action type
          dependencies: [{ name: "base" }],
          createActionTypes: {
            Build: [
              {
                name: "test-action-type-extension",
                docs: "extension",
                base: "test", // <--
                schema: joi.object(),
                handlers: {
                  build: async (params) => testHandler(params),
                },
              },
            ],
          },
        })

        const { router } = await createTestRouter([basePlugin, plugin2])

        const handler = router.getHandler({ handlerType: "build", actionType: "test-action-type-extension" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.actionType).to.equal("test-action-type-extension")
        expect(handler.pluginName).to.equal(plugin2.name)
      })

      it("should fall back on the base if no specific handler is available", async () => {
        const basePlugin = createGardenPlugin({
          name: "base",
          dependencies: [],
          createActionTypes: { Build: [testBuildDefinition] },
        })
        const plugin2 = createGardenPlugin({
          name: "plugin2",
          // <- creates, not extends action type
          dependencies: [{ name: "base" }],
          createActionTypes: {
            Build: [
              {
                name: "test-action-type-extension",
                docs: "extension",
                base: "test", // <--
                schema: joi.object(),
                handlers: {}, // <-- no handlers defined
              },
            ],
          },
        })

        const { router } = await createTestRouter([basePlugin, plugin2])

        const handler = router.getHandler({ handlerType: "build", actionType: "test-action-type-extension" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.actionType).to.equal("test")
        expect(handler.pluginName).to.equal(basePlugin.name)
      })

      it("should recursively fall back on the base's bases if needed", async () => {
        const basePlugin = createGardenPlugin({
          name: "base",
          dependencies: [],
          createActionTypes: {
            Build: [testBuildDefinition],
          },
        })
        const basePlugin2 = createGardenPlugin({
          name: "base-2",
          dependencies: [{ name: "base" }],
          createActionTypes: {
            Build: [
              {
                name: "base-2",
                docs: "base-2",
                base: "test", // <--
                schema: joi.object(),
                handlers: {}, // <-- no handlers defined
              },
            ],
          },
        })
        const plugin2 = createGardenPlugin({
          name: "plugin2",
          // <- creates, not extends action type
          dependencies: [{ name: "base-2" }],
          createActionTypes: {
            Build: [
              {
                name: "test-action-type-extension",
                docs: "extension",
                base: "base-2", // <--
                schema: joi.object(),
                handlers: {}, // <-- no handlers defined
              },
            ],
          },
        })

        const { router } = await createTestRouter([basePlugin, basePlugin2, plugin2])

        const handler = router.getHandler({ handlerType: "build", actionType: "test-action-type-extension" })

        expect(handler.handlerType).to.equal("build")
        expect(handler.actionType).to.equal("test")
        expect(handler.pluginName).to.equal(basePlugin.name)
      })
    })
  })

  describe("callHandler", () => {
    it("should call the specified handler", async () => {
      const plugin = createGardenPlugin({
        name: "test",
        dependencies: [],
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })

      const { garden, router } = await createTestRouter([plugin])

      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: garden.projectRoot,
          },
          spec: {},
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = await resolveAction({
        garden,
        graph,
        action: graph.getBuild("foo"),
        log: garden.log,
      })

      const { result } = await router.callHandler({
        handlerType: "build",
        params: { graph, log: garden.log, action, events: undefined },
      })

      expect(result.outputs.foo).to.equal("bar")
    })

    it("should should throw if the handler is not found", async () => {
      const plugin = createGardenPlugin({
        name: "test",
        dependencies: [],
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })

      const { garden, router } = await createTestRouter([plugin])

      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: garden.projectRoot,
          },
          spec: {},
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = await resolveAction({
        garden,
        graph,
        action: graph.getBuild("foo"),
        log: garden.log,
      })

      await expectError(
        () =>
          router.callHandler({
            handlerType: "getOutputs", // this handler type is not specified on the test plugin,
            params: { graph, log: garden.log, action, events: undefined },
          }),
        { contains: "No 'getOutputs' handler configured for build type" }
      )
    })

    it("should call the handler with a base argument if the handler is overriding another", async () => {
      const base = createGardenPlugin({
        name: "base",
        dependencies: [],
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })
      const plugin = createGardenPlugin({
        name: "test",
        dependencies: [],
        extendActionTypes: {
          Build: [
            {
              name: "test",
              handlers: {
                build: async (params) => testHandler(params),
              },
            },
          ],
        },
      })

      const { garden, router } = await createTestRouter([base, plugin])

      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: garden.projectRoot,
          },
          spec: {},
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = await resolveAction({
        garden,
        graph,
        action: graph.getBuild("foo"),
        log: garden.log,
      })

      const { result } = await router.callHandler({
        handlerType: "build",
        params: { graph, log: garden.log, action, events: undefined },
      })

      expect(result.outputs.base).to.exist
      expect(result.outputs.base.pluginName).to.equal("base")
    })

    it("should call the handler with the template context for the provider", async () => {
      const plugin = createGardenPlugin({
        name: "test",
        dependencies: [],
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })

      const { garden, router } = await createTestRouter([plugin])

      garden.setPartialActionConfigs([
        {
          kind: "Build",
          type: "test",
          name: "foo",
          internal: {
            basePath: garden.projectRoot,
          },
          spec: {},
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = await resolveAction({
        garden,
        graph,
        action: graph.getBuild("foo"),
        log: garden.log,
      })

      const { result } = await router.callHandler({
        handlerType: "build",
        params: { graph, log: garden.log, action, events: undefined },
      })

      const resolved = result.outputs.projectName
      expect(resolved).to.equal(garden.projectName)
    })
  })

  describe("validateActionOutputs", () => {
    let resolvedBuildAction: ResolvedBuildAction
    let testPlugins: GardenPluginSpec[]

    before(async () => {
      const data = await getRouterTestData()
      testPlugins = [data.plugins.basePlugin, data.plugins.testPluginA]
      resolvedBuildAction = data.resolvedBuildAction
    })

    it("validates static outputs", async () => {
      const { router } = await createTestRouter(testPlugins)

      await expectError(
        async () => await router.validateActionOutputs(resolvedBuildAction, "static", { staticKey: 123 }),
        {
          contains: ["Error validating static action outputs from Build", "staticKey must be a string"],
        }
      )
    })

    it("validates runtime outputs", async () => {
      const { router } = await createTestRouter(testPlugins)

      await expectError(async () => await router.validateActionOutputs(resolvedBuildAction, "runtime", { foo: 123 }), {
        contains: ["Error validating runtime action outputs from Build 'module-a'", "foo must be a string"],
      })
    })

    // Not yet implemented
    it.skip("throws if no schema is set and a key is set", async () => {
      throw "TODO-G2"
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
          contains: "thispropertyfrombasemustbepresent must be a number",
        }
      )
    })
  })
})
