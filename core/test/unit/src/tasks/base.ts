/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { resolve } from "path"
import { dataDir, makeTestGarden, TestGarden } from "../../../helpers"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { BaseActionTask, ValidResultType } from "../../../../src/tasks/base"
import { TestAction } from "../../../../src/actions/test"

describe("BaseActionTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry

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
    garden = await makeTestGarden(resolve(dataDir, "test-project-test-deps"))
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
      it("doesn't return deploy or task dependencies", async () => {
        const action = graph.getTest("module-a-integ")

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
        expect(deps.find((dep) => dep.type === "deploy" || dep.type === "task")).to.be.undefined
      })
    })
  })
})
