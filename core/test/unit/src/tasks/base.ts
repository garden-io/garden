/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getDataDir, makeTestGarden, TestGarden } from "../../../helpers"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { BaseActionTask, ValidResultType } from "../../../../src/tasks/base"
import { TestAction } from "../../../../src/actions/test"

describe("BaseActionTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry

  const projectRoot = getDataDir("test-project-test-deps")

  class TestTask extends BaseActionTask<TestAction, ValidResultType> {
    type = "test"

    getDescription() {
      return "foo"
    }

    async getStatus() {
      return { state: "ready", outputs: {} } as ValidResultType
    }

    async process() {
      return { state: "ready", outputs: {} } as ValidResultType
    }
  }

  beforeEach(async () => {
    garden = await makeTestGarden(projectRoot)
    // Adding this to test dependencies on Test actions
    garden.addAction({
      kind: "Test",
      name: "test-b",
      type: "test",
      dependencies: [
        { kind: "Build", name: "module-a" },
        { kind: "Deploy", name: "service-b" },
        { kind: "Run", name: "task-a" },
        { kind: "Test", name: "module-a-integ" },
      ],
      internal: {
        basePath: projectRoot,
      },
      spec: {
        command: ["echo", "foo"],
      },
    })
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    log = garden.log
  })

  describe("resolveStatusDependencies", () => {
    it("returns the resolve task for the action", async () => {
      const action = graph.getTest("module-a-integ")

      const task = new TestTask({
        garden,
        log,
        graph,
        action,
        force: true,
        forceBuild: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
        fromWatch: false,
      })

      const deps = task.resolveStatusDependencies()

      expect(deps.map((d) => d.getBaseKey())).to.eql(["resolve-action.test.module-a-integ"])
    })
  })

  describe("resolveProcessDependencies", () => {
    it("should include task dependencies", async () => {
      const action = graph.getTest("module-a-integ")

      const task = new TestTask({
        garden,
        log,
        graph,
        action,
        force: true,
        forceBuild: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
        fromWatch: false,
      })

      const deps = task.resolveProcessDependencies({ status: null })

      expect(deps.map((d) => d.getBaseKey()).sort()).to.eql([
        "build.module-a",
        "deploy.service-b",
        "resolve-action.test.module-a-integ",
        "run.task-a",
      ])
    })

    it("includes all runtime dependencies by default", async () => {
      const action = graph.getTest("test-b")

      const task = new TestTask({
        garden,
        log,
        graph,
        action,
        force: true,
        forceBuild: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
        fromWatch: false,
      })

      const deps = task.resolveProcessDependencies({ status: null })

      expect(deps.map((d) => d.getBaseKey()).sort()).to.eql([
        "build.module-a",
        "deploy.service-b",
        "resolve-action.test.test-b",
        "run.task-a",
        "test.module-a-integ",
      ])
    })

    it("returns just the resolve task if the status is ready and force=false", async () => {
      const action = graph.getTest("module-a-integ")

      const task = new TestTask({
        garden,
        log,
        graph,
        action,
        force: false,
        forceBuild: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
        fromWatch: false,
      })

      const deps = task.resolveProcessDependencies({ status: { state: "ready", outputs: {} } })

      expect(deps.map((d) => d.getBaseKey())).to.eql(["resolve-action.test.module-a-integ"])
    })

    context("when skipRuntimeDependencies = true", () => {
      it("doesn't return Deploy, Run or Test dependencies", async () => {
        graph = await garden.getConfigGraph({ log: garden.log, emit: false })

        const action = graph.getTest("test-b")

        const task = new TestTask({
          garden,
          log,
          graph,
          action,
          force: true,
          forceBuild: false,
          skipRuntimeDependencies: true, // <-----
          devModeDeployNames: [],
          localModeDeployNames: [],
          fromWatch: false,
        })

        const deps = task.resolveProcessDependencies({ status: null })

        expect(deps.map((d) => d.getBaseKey()).sort()).to.eql([
          "build.module-a",
          // "deploy.service-b", <----
          "resolve-action.test.test-b",
          // "run.task-a", <----
          // "test.module-a-integ", <----
        ])
      })
    })
  })
})
