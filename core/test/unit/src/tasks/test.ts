/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { resolve } from "path"
import { TestTask } from "../../../../src/tasks/test"
import { dataDir, makeTestGarden, TestGarden } from "../../../helpers"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../src/config-graph"
import { testFromConfig } from "../../../../src/types/test"

describe("TestTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-test-deps"))
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    log = garden.log
  })

  describe("getDependencies", () => {
    it("should include task dependencies", async () => {
      const moduleA = graph.getModule("module-a")
      const testConfig = moduleA.testConfigs[0]

      const task = new TestTask({
        garden,
        log,
        graph,
        test: testFromConfig(moduleA, testConfig, graph),
        force: true,
        forceBuild: false,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      const deps = await task.resolveDependencies()

      expect(deps.map((d) => d.getKey())).to.eql(["build.module-a", "deploy.service-b", "task.task-a"])
    })

    context("when skipRuntimeDependencies = true", () => {
      it("doesn't return deploy or task dependencies", async () => {
        const moduleA = graph.getModule("module-a")
        const testConfig = moduleA.testConfigs[0]

        const task = new TestTask({
          garden,
          log,
          graph,
          test: testFromConfig(moduleA, testConfig, graph),
          force: true,
          forceBuild: false,
          skipRuntimeDependencies: true, // <-----
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        const deps = await task.resolveDependencies()
        expect(deps.find((dep) => dep.type === "deploy" || dep.type === "task")).to.be.undefined
      })
    })
  })
})
