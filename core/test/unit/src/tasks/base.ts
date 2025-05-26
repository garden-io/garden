/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { TestGarden } from "../../../helpers.js"
import { getDataDir, makeTestGarden } from "../../../helpers.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"
import type { ValidResultType } from "../../../../src/tasks/base.js"
import { BaseActionTask } from "../../../../src/tasks/base.js"
import type { TestAction } from "../../../../src/actions/test.js"
import { DEFAULT_TEST_TIMEOUT_SEC } from "../../../../src/constants.js"
import { DeployTask } from "../../../../src/tasks/deploy.js"

describe("BaseActionTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: Log

  const projectRoot = getDataDir("test-project-test-deps")

  class TestTask extends BaseActionTask<TestAction, ValidResultType> {
    override readonly statusConcurrencyLimit = 10
    override readonly executeConcurrencyLimit = 10

    readonly type = "test"

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
      timeout: DEFAULT_TEST_TIMEOUT_SEC,
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

  afterEach(() => {
    garden.close()
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

    it("omits disabled runtime dependencies, but includes disabled builds", async () => {
      garden.addAction({
        kind: "Run",
        name: "disabled-run",
        type: "test",
        disabled: true,
        timeout: DEFAULT_TEST_TIMEOUT_SEC,
        dependencies: [{ kind: "Run", name: "task-a" }],
        internal: {
          basePath: projectRoot,
        },
        spec: {
          command: ["echo", "foo"],
        },
      })
      garden.addAction({
        kind: "Build",
        name: "disabled-build",
        type: "test",
        disabled: true,
        timeout: DEFAULT_TEST_TIMEOUT_SEC,
        dependencies: [],
        internal: {
          basePath: projectRoot,
        },
        spec: {
          command: ["echo", "foo"],
        },
      })
      garden.addAction({
        kind: "Deploy",
        name: "with-disabled-deps",
        type: "test",
        timeout: DEFAULT_TEST_TIMEOUT_SEC,
        dependencies: [
          { kind: "Run", name: "disabled-run" },
          { kind: "Build", name: "disabled-build" },
          { kind: "Build", name: "module-a" },
        ],
        internal: {
          basePath: projectRoot,
        },
        spec: {
          command: ["echo", "foo"],
        },
      })
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      const action = graph.getDeploy("with-disabled-deps")

      const task = new DeployTask({
        garden,
        log,
        graph,
        action,
        force: false,
        forceBuild: false,
      })

      const deps = task.resolveProcessDependencies({ status: null })
      expect(deps.map((d) => d.getBaseKey())).to.eql([
        "resolve-action.deploy.with-disabled-deps",
        // "run.disabled-run", // <-----
        "build.disabled-build",
        "build.module-a",
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
