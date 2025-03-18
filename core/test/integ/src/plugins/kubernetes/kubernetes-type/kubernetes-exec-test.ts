/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import type { TestGarden } from "../../../../../helpers.js"
import { findNamespaceStatusEvent } from "../../../../../helpers.js"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import { getKubernetesTestGarden } from "./common.js"
import { TestTask } from "../../../../../../src/tasks/test.js"

describe("kubernetes-type exec Test", () => {
  let garden: TestGarden
  let graph: ConfigGraph

  before(async () => {
    garden = await getKubernetesTestGarden()
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  it("should run a basic Test", async () => {
    const action = graph.getTest("echo-test-exec")

    const testTask = new TestTask({
      garden,
      graph,
      action,
      log: garden.log,
      force: true,
      forceBuild: false,
    })

    garden.events.eventLog = []
    const results = await garden.processTasks({ tasks: [testTask], throwOnError: true })
    expect(findNamespaceStatusEvent(garden.events.eventLog, "kubernetes-type-test-default")).to.exist
    const result = results.results.getResult(testTask)

    expect(result).to.exist
    expect(result?.result).to.exist
    expect(result?.outputs).to.exist
    expect(result?.result?.outputs.log).to.equal("ok")
  })
})
