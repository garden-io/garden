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
import { actionIsDisabled, getActionConfigVersion } from "../../../../src/actions/base.js"

describe("getActionConfigVersion", () => {
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
        const version1 = getActionConfigVersion(config1)

        const config2 = minimalActionConfig()
        config2[field] = valuePair.rightValue
        const version2 = getActionConfigVersion(config2)

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

    const versionA = getActionConfigVersion(configA)
    const versionB = getActionConfigVersion(configB)

    expect(versionA).to.equal(versionB)
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
