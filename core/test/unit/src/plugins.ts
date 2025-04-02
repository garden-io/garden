/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { joi } from "../../../src/config/common.js"
import { getRootLogger } from "../../../src/logger/logger.js"
import type { BuildActionDefinition } from "../../../src/plugin/action-types.js"
import type { PluginBuildActionParamsBase } from "../../../src/plugin/plugin.js"
import { ACTION_RUNTIME_LOCAL, createGardenPlugin } from "../../../src/plugin/plugin.js"
import { resolvePlugins } from "../../../src/plugins.js"
import { findByName } from "../../../src/util/util.js"
import { expectError } from "../../helpers.js"
import { UnresolvedProviderConfig } from "../../../src/config/project.js"

describe("resolvePlugins", () => {
  const log = getRootLogger().createLog()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const testHandler = (params: PluginBuildActionParamsBase<any>) => {
    return {
      detail: {
        runtime: ACTION_RUNTIME_LOCAL,
      },
      outputs: {
        foo: "bar",
        // Pass through to allow validation of inputs
        params,
      },
      state: "ready" as const,
    }
  }

  const testBuildDefinition: BuildActionDefinition = {
    name: "test",
    docs: "Test Build definition",
    schema: joi.object(),
    handlers: {
      build: async (params) => testHandler(params),
    },
  }

  it("throws if action type staticOutputsSchema and runtimeOutputsSchema have overlapping keys", async () => {
    const plugin = createGardenPlugin({ name: "test" })
    plugin.createActionTypes.Build = [
      {
        name: "test",
        docs: "foo",
        schema: joi.object(),
        staticOutputsSchema: joi.object().keys({
          commonKey: joi.string(),
        }),
        runtimeOutputsSchema: joi.object().keys({
          commonKey: joi.string(),
        }),
        handlers: {},
      },
    ]

    await expectError(
      async () => resolvePlugins(log, { test: plugin }, [new UnresolvedProviderConfig("test", [], { name: "test" })]),
      {
        contains: "has overlapping keys in staticoutputsschema and runtimeoutputsschema",
      }
    )
  })

  it("throws if action type staticOutputsSchema allows unknown keys", async () => {
    const plugin = createGardenPlugin({ name: "test" })
    plugin.createActionTypes.Build = [
      {
        name: "test",
        docs: "foo",
        schema: joi.object(),
        staticOutputsSchema: joi
          .object()
          .keys({
            foo: joi.string(),
          })
          .unknown(true), // <---
        handlers: {},
      },
    ]

    await expectError(
      async () => resolvePlugins(log, { test: plugin }, [new UnresolvedProviderConfig("base", [], { name: "test" })]),
      {
        contains: "allows unknown keys in the staticoutputsschema",
      }
    )
  })

  it("inherits created action type from base plugin", async () => {
    const base = createGardenPlugin({ name: "base" })
    base.createActionTypes.Build = [
      {
        name: "base",
        docs: "foo",
        schema: joi.object(),
        handlers: {
          build: async ({}) => ({
            detail: {
              runtime: ACTION_RUNTIME_LOCAL,
            },
            outputs: {
              foo: "bar",
            },
            state: "ready",
          }),
        },
      },
    ]

    const dependant = createGardenPlugin({ name: "dependant", base: "base" })

    const result = resolvePlugins(log, { base, dependant }, [
      new UnresolvedProviderConfig("test", [], { name: "test" }),
    ])
    const inheritedActionType = result.find((plugin) => plugin.name === "dependant")?.createActionTypes.Build[0]
    expect(inheritedActionType).to.exist
    expect(inheritedActionType?.name).to.eql("base")
  })

  it("throws if redefining an action type created in base", async () => {
    const base = createGardenPlugin({ name: "base" })
    base.createActionTypes.Build = [
      {
        name: "base",
        docs: "foo",
        schema: joi.object(),
        handlers: {
          build: async ({}) => ({
            detail: {
              runtime: ACTION_RUNTIME_LOCAL,
            },
            outputs: {
              foo: "bar",
            },
            state: "ready",
          }),
        },
      },
    ]

    const dependant = createGardenPlugin({ name: "dependant", base: "base" })
    dependant.createActionTypes.Build = [
      {
        name: "base",
        docs: "foo",
        schema: joi.object(),
        handlers: {
          build: async ({}) => ({
            detail: {
              runtime: ACTION_RUNTIME_LOCAL,
            },
            outputs: {
              foo: "bar",
            },
            state: "ready",
          }),
        },
      },
    ]

    await expectError(
      async () =>
        resolvePlugins(log, { base, dependant }, [new UnresolvedProviderConfig("test", [], { name: "test" })]),
      {
        contains: "plugin 'dependant' redeclares the 'base' build type, already declared by its base",
      }
    )
  })

  it("inherits action type extension from base plugin", async () => {
    const base1 = createGardenPlugin({
      name: "base1",
      createActionTypes: {
        Build: [testBuildDefinition],
      },
    })
    const base2 = createGardenPlugin({
      name: "base2",
      dependencies: [{ name: "base1" }],
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

    const dependant = createGardenPlugin({ name: "dependant", base: "base2" })

    const plugins = resolvePlugins(log, { base1, base2, dependant }, [
      new UnresolvedProviderConfig("dependant", [], { name: "dependant" }),
    ])
    const resolved = findByName(plugins, "dependant")

    expect(resolved).to.exist

    const inheritedExtendActionType = resolved?.extendActionTypes.Build[0]

    expect(inheritedExtendActionType).to.exist
    expect(inheritedExtendActionType?.name).to.eql("test")
  })

  context("extending action type", () => {
    it("attaches corresponding create handler from base to extension handler", async () => {
      const base = createGardenPlugin({
        name: "base",
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })
      const extension = createGardenPlugin({
        name: "extension",
        dependencies: [{ name: "base" }],
        extendActionTypes: {
          Build: [
            {
              name: "test",
              handlers: {
                build: async ({}) => ({
                  detail: {
                    runtime: ACTION_RUNTIME_LOCAL,
                  },
                  outputs: {
                    foo: "overridden",
                  },
                  state: "ready",
                }),
              },
            },
          ],
        },
      })

      const plugins = resolvePlugins(log, { base, extension }, [
        new UnresolvedProviderConfig("base", [], { name: "base" }),
        new UnresolvedProviderConfig("extension", [], { name: "extension" }),
      ])
      const resolved = findByName(plugins, "extension")

      expect(resolved).to.exist

      const handler = resolved?.extendActionTypes.Build[0].handlers.build

      expect(handler).to.exist
      expect(handler?.base).to.exist
    })

    it("attaches corresponding create handler from base of base", async () => {
      const base1 = createGardenPlugin({
        name: "base1",
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })
      const base2 = createGardenPlugin({
        name: "base2",
        base: "base1",
      })
      const extension = createGardenPlugin({
        name: "extension",
        dependencies: [{ name: "base2" }],
        extendActionTypes: {
          Build: [
            {
              name: "test",
              handlers: {
                build: async ({}) => ({
                  detail: {
                    runtime: ACTION_RUNTIME_LOCAL,
                  },
                  outputs: {
                    foo: "overridden",
                  },
                  state: "ready",
                }),
              },
            },
          ],
        },
      })

      const plugins = resolvePlugins(log, { base1, base2, extension }, [
        new UnresolvedProviderConfig("base1", [], { name: "base1" }),
        new UnresolvedProviderConfig("base2", [], { name: "base2" }),
        new UnresolvedProviderConfig("extension", [], { name: "extension" }),
      ])
      const resolved = findByName(plugins, "extension")

      expect(resolved).to.exist

      const handler = resolved?.extendActionTypes.Build[0].handlers.build

      expect(handler).to.exist
      expect(handler?.base).to.exist
    })
  })

  context("inheriting created action type", () => {
    it("attaches corresponding create handler from base to overriding handler", async () => {
      const base = createGardenPlugin({
        name: "base",
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })
      const inheriting = createGardenPlugin({
        name: "inheriting",
        dependencies: [{ name: "base" }],
        createActionTypes: {
          Build: [
            {
              name: "test2",
              base: "test",
              docs: "inherited type",
              schema: joi.object(),
              handlers: {
                build: async ({}) => ({
                  detail: {
                    runtime: ACTION_RUNTIME_LOCAL,
                  },
                  outputs: {
                    foo: "overridden",
                  },
                  state: "ready",
                }),
              },
            },
          ],
        },
      })

      const plugins = resolvePlugins(log, { base, inheriting }, [
        new UnresolvedProviderConfig("base", [], { name: "base" }),
        new UnresolvedProviderConfig("inheriting", [], { name: "inheriting" }),
      ])
      const resolved = findByName(plugins, "inheriting")

      expect(resolved).to.exist

      const handler = resolved?.createActionTypes.Build[0].handlers.build

      expect(handler).to.exist
      expect(handler?.base).to.exist
    })

    it("attaches corresponding create handler from base of base", async () => {
      const base1 = createGardenPlugin({
        name: "base1",
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })
      const base2 = createGardenPlugin({
        name: "base2",
        dependencies: [{ name: "base1" }],
        createActionTypes: {
          Build: [
            {
              name: "test2",
              base: "test",
              docs: "test2",
              schema: joi.object(),
              handlers: {},
            },
          ],
        },
      })
      const inheriting = createGardenPlugin({
        name: "inheriting",
        dependencies: [{ name: "base2" }],
        createActionTypes: {
          Build: [
            {
              name: "test3",
              base: "test2",
              docs: "test3",
              schema: joi.object(),
              handlers: {
                build: async ({}) => ({
                  detail: {
                    runtime: ACTION_RUNTIME_LOCAL,
                  },
                  outputs: {
                    foo: "overridden",
                  },
                  state: "ready",
                }),
              },
            },
          ],
        },
      })

      const plugins = resolvePlugins(log, { base1, base2, inheriting }, [
        new UnresolvedProviderConfig("base1", [], { name: "base1" }),
        new UnresolvedProviderConfig("base2", [], { name: "base2" }),
        new UnresolvedProviderConfig("inheriting", [], { name: "inheriting" }),
      ])
      const resolved = findByName(plugins, "inheriting")

      expect(resolved).to.exist

      const handler = resolved?.createActionTypes.Build[0].handlers.build

      expect(handler).to.exist
      expect(handler?.base).to.exist
    })
  })

  context("base is not configured", () => {
    it("pulls created action type from base", async () => {
      const base = createGardenPlugin({
        name: "base",
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })
      const extension = createGardenPlugin({
        name: "extension",
        base: "base",
        dependencies: [{ name: "base" }],
      })

      const plugins = resolvePlugins(log, { base, extension }, [
        new UnresolvedProviderConfig("extension", [], { name: "extension" }),
      ])
      const resolved = findByName(plugins, "extension")

      expect(resolved).to.exist

      const handler = resolved?.createActionTypes.Build[0].handlers.build

      expect(handler).to.exist
    })

    it("pulls action type extension from base if not defined in plugin", async () => {
      const base1 = createGardenPlugin({
        name: "base1",
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })
      const base2 = createGardenPlugin({
        name: "base2",
        base: "base1",
        dependencies: [{ name: "base1" }],
        extendActionTypes: {
          Build: [
            {
              name: "test",
              handlers: {
                build: async ({}) => ({
                  detail: {
                    runtime: ACTION_RUNTIME_LOCAL,
                  },
                  outputs: {
                    foo: "overridden",
                  },
                  state: "ready",
                }),
              },
            },
          ],
        },
      })
      const extension = createGardenPlugin({
        name: "extension",
        base: "base2",
        dependencies: [{ name: "base2" }],
      })

      const plugins = resolvePlugins(log, { base1, base2, extension }, [
        new UnresolvedProviderConfig("extension", [], { name: "extension" }),
      ])
      const resolved = findByName(plugins, "extension")

      expect(resolved).to.exist

      const handler = resolved?.extendActionTypes.Build[0].handlers.build

      expect(handler).to.exist
    })

    it("coalesces action type extension from base if both define one", async () => {
      const base1 = createGardenPlugin({
        name: "base1",
        createActionTypes: {
          Build: [testBuildDefinition],
        },
      })
      const base2 = createGardenPlugin({
        name: "base2",
        base: "base1",
        dependencies: [{ name: "base1" }],
        extendActionTypes: {
          Build: [
            {
              name: "test",
              handlers: {
                build: async ({}) => ({
                  detail: {
                    runtime: ACTION_RUNTIME_LOCAL,
                  },
                  outputs: {
                    foo: "overridden",
                  },
                  state: "ready",
                }),
              },
            },
          ],
        },
      })
      const extension = createGardenPlugin({
        name: "extension",
        base: "base2",
        dependencies: [{ name: "base2" }],
        extendActionTypes: {
          Build: [
            {
              name: "test",
              handlers: {
                getStatus: async ({}) => ({
                  detail: {
                    runtime: ACTION_RUNTIME_LOCAL,
                  },
                  outputs: {
                    foo: "overridden",
                  },
                  state: "ready",
                }),
              },
            },
          ],
        },
      })

      const plugins = resolvePlugins(log, { base1, base2, extension }, [
        new UnresolvedProviderConfig("extension", [], { name: "extension" }),
      ])
      const resolved = findByName(plugins, "extension")

      expect(resolved).to.exist

      const buildHandler = resolved?.extendActionTypes.Build[0].handlers.build
      const statusHandler = resolved?.extendActionTypes.Build[0].handlers.getStatus

      expect(buildHandler).to.exist
      expect(statusHandler).to.exist
    })
  })
})
