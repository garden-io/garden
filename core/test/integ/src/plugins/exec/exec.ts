/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ResolvedRunAction } from "../../../../../src/actions/run"
import { executeAction, resolveAction } from "../../../../../src/graph/actions"
import { ConfigGraph } from "../../../../../src/graph/config-graph"
import { TestGarden, getDataDir, makeTestGarden } from "../../../../helpers"
import { Log } from "../../../../../src/logger/log-entry"
import { ExecProviderOutputs } from "../../../../../src/plugins/exec/exec"

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
      const execProvider = await garden.resolveProvider(log, "exec")
      expect((execProvider.outputs as ExecProviderOutputs).initScript.log).to.eql("this is a provider output message")
    })

    it("actions should be able to access exec provider script result", async () => {
      const action = graph.getRun("task-a")
      action._config.spec.command = ["echo", "${providers.exec.outputs.initScript.log}"]
      const resolved = await resolveAction({ action, log, graph, garden })
      const result = await executeAction({ action: resolved, graph, log, garden })
      expect(result.getOutput("log")).to.include("this is a provider output message")
      expect(result.getOutput("log")).to.eql("this is a provider output message")
    })
  })
})
