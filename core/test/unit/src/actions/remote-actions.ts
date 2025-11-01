/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import type { Garden } from "../../../../src/garden.js"
import { gardenPlugin } from "../../../../src/plugins/exec/exec.js"
import type { ActionLog } from "../../../../src/logger/log-entry.js"
import { createActionLog } from "../../../../src/logger/log-entry.js"
import { getDataDir } from "../../../helpers.js"
import { makeTestGarden } from "../../../helpers.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"

import { ACTION_RUNTIME_LOCAL } from "../../../../src/plugin/base.js"
import { BuildTask } from "../../../../src/tasks/build.js"
import { uuidv4 } from "../../../../src/util/random.js"

describe("remote actions", () => {
  context("test-project based tests", () => {
    const testProjectRoot = getDataDir("test-project-remote-action")
    const plugin = gardenPlugin

    let garden: Garden
    // let execProvider: ExecProvider
    let graph: ConfigGraph
    let log: ActionLog

    beforeEach(async () => {
      garden = await makeTestGarden(testProjectRoot, { plugins: [plugin] })
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      // execProvider = await garden.resolveProvider({ log: garden.log, name: "exec" })
      // const ctx = await garden.getPluginContext({ provider: execProvider, templateContext: undefined, events: undefined })
      log = createActionLog({ log: garden.log, action: { name: "", kind: "Build", uid: uuidv4() } })
      await garden.clearBuilds()
    })

    afterEach(() => {
      garden.close()
    })

    it("remote action source path should default to repository root", async () => {
      const action = graph.getBuild("remote-action-a")
      const resolvedAction = await garden.resolveAction({ action, log, graph })

      const task = new BuildTask({
        garden,
        action: resolvedAction,
        graph,
        log,
        force: true,
      })

      const results = await garden.processTasks({ tasks: [task], throwOnError: true })

      expect(results.results.getResult(task)?.result?.detail).to.eql({
        buildLog: "Dockerfile",
        fresh: true,
        runtime: ACTION_RUNTIME_LOCAL,
      })
    })

    it("if remote action specifies source path, it should be relative from remote repository", async () => {
      const action = graph.getBuild("remote-action-b")
      const resolvedAction = await garden.resolveAction({ action, log, graph })

      const task = new BuildTask({
        garden,
        action: resolvedAction,
        graph,
        log,
        force: true,
      })

      const results = await garden.processTasks({ tasks: [task], throwOnError: true })

      expect(results.results.getResult(task)?.result?.detail).to.eql({
        buildLog: "Worker.java",
        fresh: true,
        runtime: ACTION_RUNTIME_LOCAL,
      })
    })
  })
})
