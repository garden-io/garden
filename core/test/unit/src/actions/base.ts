/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { DEFAULT_BUILD_TIMEOUT_SEC } from "../../../../src/constants.js"
import type { ActionConfig, BaseActionConfig } from "../../../../src/actions/types.js"
import type { NonVersionedActionConfigKey } from "../../../../src/actions/base.js"
import {
  actionIsDisabled,
  excludeValueReplacement,
  getActionConfigVersion,
  replaceExcludeValues,
} from "../../../../src/actions/base.js"
import { getRootLogger } from "../../../../src/logger/logger.js"
import { createActionLog } from "../../../../src/logger/log-entry.js"

function minimalActionConfig(): ActionConfig {
  return {
    kind: "Build",
    type: "test",
    name: "foo",
    timeout: DEFAULT_BUILD_TIMEOUT_SEC,
    internal: {
      basePath: ".",
    },
    spec: {},
  }
}

describe("getActionConfigVersion", () => {
  const log = createActionLog({
    log: getRootLogger().createLog(),
    actionName: "foo",
    actionKind: "Build",
  })

  context("action config version does not change", () => {
    // Helper types for testing non-versioned config fields.
    // The tests won't compile if the NonVersionedActionConfigKey type is modified.
    type TestValuePair<T> = { leftValue: T; rightValue: T }
    type TestMatrix = {
      [key in NonVersionedActionConfigKey]: TestValuePair<BaseActionConfig[key]>
    }

    const testMatrix: TestMatrix = {
      description: { leftValue: "Description 1", rightValue: "Description 2" },
      disabled: { leftValue: true, rightValue: false },
      exclude: { leftValue: ["file1"], rightValue: ["file2"] },
      include: { leftValue: ["file1"], rightValue: ["file2"] },
      internal: { leftValue: { basePath: "./base1" }, rightValue: { basePath: "./base2" } },
      variables: { leftValue: { foo: "bar" }, rightValue: { bar: "baz" } },
      varfiles: { leftValue: ["foo.yml"], rightValue: ["bar.yml"] },
      source: { leftValue: { path: "path1" }, rightValue: { path: "path2" } },
      version: { leftValue: {}, rightValue: { excludeValues: ["NOT-FOUND"] } },
    }

    for (const [field, valuePair] of Object.entries(testMatrix)) {
      it(`on ${field} field modification`, () => {
        const config1 = minimalActionConfig()
        config1[field] = valuePair.leftValue
        const version1 = getActionConfigVersion(log, config1)

        const config2 = minimalActionConfig()
        config2[field] = valuePair.rightValue
        const version2 = getActionConfigVersion(log, config2)

        expect(version1).to.eql(version2)
      })
    }
  })

  it("handles version.excludeValues", () => {
    const hostnameA = "a.example.com"

    const configA = minimalActionConfig()
    configA.spec.hostname = hostnameA
    configA.version = {
      excludeValues: [hostnameA],
    }

    const hostnameB = "b.example.com"
    const configB = minimalActionConfig()
    configB.spec.hostname = hostnameB
    configB.version = {
      excludeValues: [hostnameB],
    }

    const versionA = getActionConfigVersion(log, configA)
    const versionB = getActionConfigVersion(log, configB)

    expect(versionA).to.equal(versionB)
  })

  describe("version.excludeFields", () => {
    it("handles a direct object path match", () => {
      const configA = minimalActionConfig()
      configA.spec = { env: { HOSTNAME: "a.example.com" } }
      configA.version = {
        excludeFields: [["spec", "env", "HOSTNAME"]],
      }

      const configB = minimalActionConfig()
      configB.spec = { env: { HOSTNAME: "b.example.com" } }
      configB.version = configA.version

      const versionA = getActionConfigVersion(log, configA)
      const versionB = getActionConfigVersion(log, configB)

      expect(versionA).to.equal(versionB)
    })

    it("handles version.excludeFields with numeric array field references", () => {
      const configA = minimalActionConfig()
      configA.spec = { array: [{ foo: "A" }] }
      configA.version = {
        excludeFields: [["spec", "array", 0, "foo"]],
      }

      const configB = minimalActionConfig()
      configB.spec = { array: [{ foo: "B" }] }
      configB.version = configA.version

      const versionA = getActionConfigVersion(log, configA)
      const versionB = getActionConfigVersion(log, configB)

      expect(versionA).to.equal(versionB)
    })

    it("handles version.excludeFields with wildcard array field references", () => {
      const configA = minimalActionConfig()
      configA.spec = { array: [{ foo: "A" }] }
      configA.version = {
        excludeFields: [["spec", "array", "*", "foo"]],
      }

      const configB = minimalActionConfig()
      configB.spec = { array: [{ foo: "B" }] }
      configB.version = configA.version

      const versionA = getActionConfigVersion(log, configA)
      const versionB = getActionConfigVersion(log, configB)

      expect(versionA).to.equal(versionB)
    })

    it("handles version.excludeFields with wildcard object field references", () => {
      const configA = minimalActionConfig()
      configA.spec = { array: [{ foo: "A" }] }
      configA.version = {
        excludeFields: [["spec", "*", "*", "foo"]],
      }

      const configB = minimalActionConfig()
      configB.spec = { array: [{ foo: "B" }] }
      configB.version = configA.version

      const versionA = getActionConfigVersion(log, configA)
      const versionB = getActionConfigVersion(log, configB)

      expect(versionA).to.equal(versionB)
    })
  })
})

describe("replaceExcludeValues", () => {
  const log = createActionLog({
    log: getRootLogger().createLog(),
    actionName: "foo",
    actionKind: "Build",
  })

  it("handles multiple replacements in the same string", () => {
    const config = minimalActionConfig()
    config.spec.hostname = "bla.foo.bar.foo"
    config.version = {
      excludeValues: ["foo"],
    }

    const replaced = replaceExcludeValues(config, log) as ActionConfig

    expect(replaced.spec.hostname).to.equal(`bla.${excludeValueReplacement}.bar.${excludeValueReplacement}`)
  })

  describe("version.excludeFields", () => {
    it("handles a direct object path match", () => {
      const config = minimalActionConfig()
      config.spec = { env: { HOSTNAME: "a.example.com" } }
      config.version = {
        excludeFields: [["spec", "env", "HOSTNAME"]],
      }

      const replaced = replaceExcludeValues(config, log) as any

      expect(replaced.spec).to.eql({ env: {} })
    })

    it("handles version.excludeFields with numeric array field references", () => {
      const config = minimalActionConfig()
      config.spec = { array: [{ foo: "A" }, { foo: "B" }] }
      config.version = {
        excludeFields: [["spec", "array", 0]],
      }

      const replaced = replaceExcludeValues(config, log) as any

      expect(replaced.spec.array).to.eql([{ foo: "B" }])
    })

    it("handles version.excludeFields with key references under numeric array field references", () => {
      const config = minimalActionConfig()
      config.spec = { array: [{ foo: "A" }, { foo: "B" }] }
      config.version = {
        excludeFields: [["spec", "array", 0, "foo"]],
      }

      const replaced = replaceExcludeValues(config, log) as any

      expect(replaced.spec.array).to.eql([{}, { foo: "B" }])
    })

    it("handles version.excludeFields with wildcard array field references", () => {
      const config = minimalActionConfig()
      config.spec = {
        array: [
          { foo: "A", bar: "A" },
          { foo: "B", bar: "B" },
        ],
      }
      config.version = {
        excludeFields: [["spec", "array", "*", "foo"]],
      }

      const replaced = replaceExcludeValues(config, log) as any

      expect(replaced.spec.array).to.eql([{ bar: "A" }, { bar: "B" }])
    })

    it("handles version.excludeFields with wildcard object field references", () => {
      const config = minimalActionConfig()
      config.spec = {
        array: [
          { foo: "A", bar: "A" },
          { foo: "B", bar: "B" },
        ],
      }
      config.version = {
        excludeFields: [["spec", "array", "*", "*"]],
      }

      const replaced = replaceExcludeValues(config, log) as any

      expect(replaced.spec).to.eql({ array: [{}, {}] })
    })
  })
})

describe("actionIsDisabled", () => {
  it("returns true if the action is disabled", () => {
    const config: ActionConfig = {
      kind: "Build",
      type: "test",
      name: "foo",
      timeout: DEFAULT_BUILD_TIMEOUT_SEC,
      internal: {
        basePath: ".",
      },
      spec: {},
      disabled: true,
    }
    expect(actionIsDisabled(config, "foo")).to.eql(true)
  })

  it("returns false if the action is not disabled", () => {
    const config: ActionConfig = {
      kind: "Build",
      type: "test",
      name: "foo",
      timeout: DEFAULT_BUILD_TIMEOUT_SEC,
      internal: {
        basePath: ".",
      },
      disabled: false,
      spec: {},
    }
    expect(actionIsDisabled(config, "foo")).to.eql(false)
  })

  it("returns false if action environments field is undefined", () => {
    const config: ActionConfig = {
      kind: "Build",
      type: "test",
      name: "foo",
      timeout: DEFAULT_BUILD_TIMEOUT_SEC,
      internal: {
        basePath: ".",
      },
      disabled: false,
      environments: undefined,
      spec: {},
    }
    expect(actionIsDisabled(config, "foo")).to.eql(false)
  })

  it("returns false if action environments field is set and contains the environment", () => {
    const config: ActionConfig = {
      kind: "Build",
      type: "test",
      name: "foo",
      timeout: DEFAULT_BUILD_TIMEOUT_SEC,
      internal: {
        basePath: ".",
      },
      disabled: false,
      environments: ["yes"],
      spec: {},
    }
    expect(actionIsDisabled(config, "yes")).to.eql(false)
  })

  it("returns true if action environments field is set and does not contain the environment", () => {
    const config: ActionConfig = {
      kind: "Build",
      type: "test",
      name: "foo",
      timeout: DEFAULT_BUILD_TIMEOUT_SEC,
      internal: {
        basePath: ".",
      },
      disabled: false,
      environments: ["yes"],
      spec: {},
    }
    expect(actionIsDisabled(config, "no")).to.eql(true)
  })
})
