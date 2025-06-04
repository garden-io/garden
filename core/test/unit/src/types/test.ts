/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getDataDir, makeTestGarden, makeTestGardenA } from "../../../helpers.js"
import type { TestConfig } from "../../../../src/config/test.js"
import { testFromConfig } from "../../../../src/types/test.js"
import cloneDeep from "fast-copy"

import { DEFAULT_TEST_TIMEOUT_SEC } from "../../../../src/constants.js"

describe("testFromConfig", () => {
  it("should propagate the disabled flag from the config", async () => {
    const config: TestConfig = {
      name: "test",
      dependencies: [],
      disabled: true,
      spec: {},
      timeout: DEFAULT_TEST_TIMEOUT_SEC,
    }

    const garden = await makeTestGardenA()
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const module = graph.getModule("module-a")
    const test = testFromConfig(module, config, graph.moduleGraph)

    expect(test.disabled).to.be.true
  })

  it("should set disabled=true if the module is disabled", async () => {
    const config: TestConfig = {
      name: "test",
      dependencies: [],
      disabled: false,
      spec: {},
      timeout: DEFAULT_TEST_TIMEOUT_SEC,
    }

    const garden = await makeTestGardenA()
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const module = graph.getModule("module-a")
    module.disabled = true
    const test = testFromConfig(module, config, graph.moduleGraph)

    expect(test.disabled).to.be.true
  })

  it("should include dependencies in version calculation", async () => {
    const garden = await makeTestGarden(getDataDir("test-project-test-deps"))
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    let moduleA = graph.getModule("module-a")
    const testConfig = moduleA.testConfigs[0]
    const versionBeforeChange = testFromConfig(moduleA, testConfig, graph.moduleGraph).version
    const backup = cloneDeep(graph.moduleGraph.getModule("module-b"))

    // Verify that changed build version is reflected in the test version
    graph.moduleGraph["modules"]["module-b"].version.versionString = "12345"
    moduleA = graph.getModule("module-a")
    const testAfterBuildChange = testFromConfig(moduleA, testConfig, graph.moduleGraph)
    expect(versionBeforeChange).to.not.eql(testAfterBuildChange.version)

    // Verify that changed service dependency config is reflected in the test version
    graph.moduleGraph["modules"]["module-b"] = backup
    graph.moduleGraph["serviceConfigs"]["service-b"].config.spec["command"] = ["echo", "something-else"]
    moduleA = graph.getModule("module-a")
    const testAfterServiceConfigChange = testFromConfig(moduleA, testConfig, graph.moduleGraph)
    expect(versionBeforeChange).to.not.eql(testAfterServiceConfigChange.version)

    // Verify that changed task dependency config is reflected in the test version
    graph.moduleGraph["modules"]["module-b"] = backup
    graph.moduleGraph["taskConfigs"]["task-a"].config.spec["command"] = ["echo", "something-else"]
    moduleA = graph.getModule("module-a")
    const testAfterTaskConfigChange = testFromConfig(moduleA, testConfig, graph.moduleGraph)
    expect(versionBeforeChange).to.not.eql(testAfterTaskConfigChange.version)
  })
})
