/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { joi } from "../../../src/config/common"
import { getLogger } from "../../../src/logger/logger"
import { createGardenPlugin } from "../../../src/plugin/plugin"
import { resolvePlugins } from "../../../src/plugins"
import { expectError } from "../../helpers"

describe("resolvePlugins", () => {
  const log = getLogger().placeholder()

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

    await expectError(async () => resolvePlugins(log, { test: plugin }, [{ name: "test" }]), {
      contains: "has overlapping keys in staticoutputsschema and runtimeoutputsschema",
    })
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

    await expectError(async () => resolvePlugins(log, { test: plugin }, [{ name: "test" }]), {
      contains: "allows unknown keys in the staticoutputsschema",
    })
  })

  it("inherits created action type from base plugin", async () => {
    const base = createGardenPlugin({ name: "base" })
    base.createActionTypes.Build = [
      {
        name: "base",
        docs: "foo",
        schema: joi.object(),
        handlers: {
          build: async (asd: any) => ({
            detail: {},
            outputs: {
              foo: "bar",
            },
            state: "ready",
          }),
        },
      },
    ]

    const dependant = createGardenPlugin({ name: "dependant", base: "base" })

    const result = resolvePlugins(log, { base, dependant }, [{ name: "test" }])
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
          build: async (asd: any) => ({
            detail: {},
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
          build: async (asd: any) => ({
            detail: {},
            outputs: {
              foo: "bar",
            },
            state: "ready",
          }),
        },
      },
    ]

    await expectError(async () => resolvePlugins(log, { base, dependant }, [{ name: "test" }]), {
      contains: "plugin 'dependant' redeclares the 'base' build type, already declared by its base.",
    })
  })

  it("inherits action type extension from base plugin", async () => {
    const base = createGardenPlugin({ name: "base" })
    base.createActionTypes.Build = [
      {
        name: "base",
        docs: "asd",
        schema: joi.object(),
        handlers: {
          build: async (asd: any) => ({
            detail: {},
            outputs: {
              foo: "bar",
            },
            state: "ready",
          }),
        },
      },
    ]
    base.extendActionTypes.Build = [
      {
        name: "extension",
        handlers: {
          validate: async (prop) => ({}),
        },
      },
    ]
    const dependant = createGardenPlugin({ name: "dependant", base: "base" })

    const result = resolvePlugins(log, { base, dependant }, [{ name: "test" }])
    const inheritedExtendActionType = result.find((plugin) => plugin.name === "dependant")?.extendActionTypes.Build[0]
    expect(inheritedExtendActionType).to.exist
    expect(inheritedExtendActionType?.name).to.eql("extension")
  })
})
