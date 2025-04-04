/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { TestTask } from "../../../../src/tasks/test.js"
import type { TestGarden } from "../../../helpers.js"
import { freezeTime, getDataDir, makeTestGarden } from "../../../helpers.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"

describe("TestTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: Log

  beforeEach(async () => {
    garden = await makeTestGarden(getDataDir("test-project-test-deps"))
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    log = garden.log
  })

  afterEach(() => {
    garden.close()
  })

  describe("process", () => {
    it("should emit testStatus events", async () => {
      garden.events.eventLog = []
      const action = graph.getTest("module-a-integ")

      const testTask = new TestTask({
        garden,
        log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const now = freezeTime().toISOString()
      await garden.processTasks({ tasks: [testTask], throwOnError: true })

      const testStatusEvents = garden.events.eventLog.filter((e) => e.name === "testStatus")
      const actionVersion = testStatusEvents[0].payload.actionVersion
      const actionUid = testStatusEvents[0].payload.actionUid

      expect(testStatusEvents).to.eql([
        {
          name: "testStatus",
          payload: {
            actionName: "module-a-integ",
            actionVersion,
            actionType: "test",
            actionKind: "test",
            actionUid,
            moduleName: "module-a",
            startedAt: now,
            force: true,
            operation: "getStatus",
            state: "getting-status",
            sessionId: garden.sessionId,
            runtime: undefined,
            status: { state: "unknown" },
          },
        },
        {
          name: "testStatus",
          payload: {
            actionName: "module-a-integ",
            actionVersion,
            actionType: "test",
            actionKind: "test",
            actionUid,
            moduleName: "module-a",
            startedAt: now,
            completedAt: now,
            force: true,
            operation: "getStatus",
            state: "not-ready",
            sessionId: garden.sessionId,
            runtime: undefined,
            status: { state: "unknown" },
          },
        },
        {
          name: "testStatus",
          payload: {
            actionName: "module-a-integ",
            actionVersion,
            actionType: "test",
            actionKind: "test",
            actionUid,
            moduleName: "module-a",
            startedAt: now,
            force: true,
            operation: "process",
            state: "processing",
            sessionId: garden.sessionId,
            runtime: undefined,
            status: { state: "running" },
          },
        },
        {
          name: "testStatus",
          payload: {
            actionName: "module-a-integ",
            actionVersion,
            actionType: "test",
            actionKind: "test",
            actionUid,
            moduleName: "module-a",
            startedAt: now,
            completedAt: now,
            force: true,
            operation: "process",
            state: "ready",
            sessionId: garden.sessionId,
            runtime: undefined,
            status: { state: "succeeded" },
          },
        },
      ])
    })
    it("should NOT emit testStatus events if statusOnly=true", async () => {
      garden.events.eventLog = []
      const action = graph.getTest("module-a-integ")

      const testTask = new TestTask({
        garden,
        log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      await garden.processTasks({ tasks: [testTask], throwOnError: true, statusOnly: true })

      const testStatusEvents = garden.events.eventLog.filter((e) => e.name === "testStatus")

      expect(testStatusEvents).to.eql([])
    })
    it("should correctly resolve runtime outputs from tasks", async () => {
      const action = graph.getTest("module-a-integ")

      const testTask = new TestTask({
        garden,
        log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const res = await garden.processTasks({ tasks: [testTask], throwOnError: true })
      const result = res.results.getResult(testTask)!

      expect(result.result?.detail?.log).to.eql("echo echo task-a-ok")
    })
  })
})
