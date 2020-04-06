/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { resolve } from "path"
import { TestTask, getTestTasks } from "../../../../src/tasks/test"
import td from "testdouble"
import { dataDir, makeTestGarden, TestGarden } from "../../../helpers"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../src/config-graph"
import { ModuleVersion } from "../../../../src/vcs/vcs"
import { findByName } from "../../../../src/util/util"

describe("TestTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-test-deps"))
    graph = await garden.getConfigGraph(garden.log)
    log = garden.log
  })

  it("should correctly resolve version for tests with dependencies", async () => {
    const resolveVersion = td.replace(garden, "resolveVersion")

    const versionA: ModuleVersion = {
      versionString: "v6fb19922cd",
      dependencyVersions: {
        "module-b": {
          contentHash: "abcdefg1234",
          files: [],
        },
      },
      files: [],
    }

    const versionB: ModuleVersion = {
      versionString: "abcdefg1234",
      dependencyVersions: {},
      files: [],
    }

    const modules = await garden.resolveModules({ log: garden.log })

    const configA = findByName(modules, "module-a")!
    const configB = findByName(modules, "module-b")!

    td.when(resolveVersion(configA, [])).thenResolve(versionA)
    td.when(resolveVersion(configB, [])).thenResolve(versionB)

    const moduleB = graph.getModule("module-b")

    td.when(resolveVersion(configA, [moduleB])).thenResolve(versionA)

    const moduleA = graph.getModule("module-a")

    td.when(resolveVersion(moduleA, [moduleB])).thenResolve(versionA)

    const testConfig = moduleA.testConfigs[0]

    const task = await TestTask.factory({
      garden,
      graph,
      log,
      module: moduleA,
      testConfig,
      force: true,
      forceBuild: false,
    })

    expect(task.version).to.eql(versionA)
  })

  describe("getDependencies", () => {
    it("should include task dependencies", async () => {
      const moduleA = graph.getModule("module-a")
      const testConfig = moduleA.testConfigs[0]

      const task = await TestTask.factory({
        garden,
        log,
        graph,
        module: moduleA,
        testConfig,
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
