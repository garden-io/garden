/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { resolve } from "path"
import { TestTask, getTestTasks } from "../../../../src/tasks/test"
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
    graph = await garden.getConfigGraph(garden.log)
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
        test: testFromConfig(moduleA, testConfig),
        force: true,
        forceBuild: false,
      })

      const deps = await task.resolveDependencies()

      expect(deps.map((d) => d.getKey())).to.eql(["build.module-a", "deploy.service-b", "task.task-a"])
    })
  })

  describe("getTestTasks", () => {
    it("should not return test tasks with deploy dependencies on services deployed with hot reloading", async () => {
      const moduleA = graph.getModule("module-a")

      const tasks = await getTestTasks({
        garden,
        log,
        graph,
        module: moduleA,
        hotReloadServiceNames: ["service-b"],
      })

      const testTask = tasks[0]
      const deps = await testTask.resolveDependencies()

      expect(tasks.length).to.eql(1)
      expect(deps.map((d) => d.getKey())).to.eql(["build.module-a", "task.task-a"])
    })
  })
})
