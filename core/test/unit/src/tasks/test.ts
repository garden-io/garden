/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { TestTask } from "../../../../src/tasks/test"
import { getDataDir, makeTestGarden, TestGarden } from "../../../helpers"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../src/graph/config-graph"

describe("TestTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGarden(getDataDir("test-project-test-deps"))
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    log = garden.log
  })

  describe("getStatus", () => {
    it("TODO", async () => {
      throw "TODO"
    })
  })

  describe("process", () => {
    it("should correctly resolve runtime outputs from tasks", async () => {
      const action = graph.getTest("module-a-integ")

      const testTask = new TestTask({
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

      const res = await garden.processTasks({ tasks: [testTask], throwOnError: true })
      const result = res.results.getResult(testTask)!

      expect(result.result?.detail?.log).to.eql("echo task-a-ok")
    })
  })
})
