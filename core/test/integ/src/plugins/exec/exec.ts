/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { ResolvedRunAction } from "../../../../../src/actions/run.js"
import { executeAction, resolveAction } from "../../../../../src/graph/actions.js"
import type { ConfigGraph } from "../../../../../src/graph/config-graph.js"
import type { TestGarden } from "../../../../helpers.js"
import { getDataDir, makeTestGarden } from "../../../../helpers.js"
import type { Log } from "../../../../../src/logger/log-entry.js"
import type { ExecProviderOutputs } from "../../../../../src/plugins/exec/exec.js"
import { parseTemplateCollection } from "../../../../../src/template/templated-collections.js"

describe("exec plugin", () => {
  let garden: TestGarden
  let log: Log
  let graph: ConfigGraph
  let actionA: ResolvedRunAction
  let actionB: ResolvedRunAction

  beforeEach(async () => {
    garden = await makeTestGarden(getDataDir("test-projects", "exec-task-outputs"))
    log = garden.log
    graph = await garden.getConfigGraph({ emit: false, log })
    actionA = await resolveAction({ action: graph.getRun("task-a"), log, graph, garden })
    actionB = await resolveAction({ action: graph.getRun("task-b"), log, graph, garden })
  })

  it("should run a run", async () => {
    await executeAction({ action: actionA, graph, log, garden })
  })

  it("should have log output in action outputs", async () => {
    const result = await executeAction({ action: actionA, graph, log, garden })
    expect(result.getOutput("log")).to.eql("task-a-output")
  })

  it("should be able to access outputs from another run", async () => {
    const result = await executeAction({ action: actionB, graph, log, garden })
    expect(result.getOutput("log")).to.eql("task-a-output")
  })

  describe("provider outputs", () => {
    it("the exec provider should have outputs for the initscript log", async () => {
      const execProvider = await garden.resolveProvider({ log, name: "exec" })
      expect((execProvider.outputs as ExecProviderOutputs).initScript.log).to.include(
        "this is a provider output message"
      )
    })

    it("actions should be able to access exec provider script result", async () => {
      const action = graph.getRun("task-a")
      action._config.spec.command = parseTemplateCollection({
        value: ["echo", "${providers.exec.outputs.initScript.log}"],
        source: { path: [] },
      })
      const resolved = await resolveAction({ action, log, graph, garden })
      const result = await executeAction({ action: resolved, graph, log, garden })
      expect(result.getOutput("log")).to.eql("this is a provider output message")
    })
  })
})
