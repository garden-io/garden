/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import type { TestGarden } from "../../../../../helpers.js"
import { expectError } from "../../../../../helpers.js"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import { getHelmTestGarden } from "./common.js"
import { TestTask } from "../../../../../../src/tasks/test.js"
import fsExtra from "fs-extra"
const { emptyDir, pathExists } = fsExtra
import { join } from "path"
import { createActionLog } from "../../../../../../src/logger/log-entry.js"

describe("Helm Pod Test", () => {
  let garden: TestGarden
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmTestGarden()
  })

  after(() => {
    garden && garden.close()
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  it("should run a basic test", async () => {
    const action = graph.getTest("artifacts-echo-test")

    const testTask = new TestTask({
      garden,
      graph,
      action,
      log: garden.log,
      force: true,
      forceBuild: false,
    })

    const results = await garden.processTasks({ tasks: [testTask], throwOnError: true })
    const result = results.results.getResult(testTask)

    expect(result).to.exist
    expect(result?.outputs).to.exist
    expect(result!.result!.detail?.log.trim()).to.equal("ok")
  })

  it("should run a test in a different namespace, if configured", async () => {
    const action = graph.getTest("chart-with-namespace-echo-test")

    const testTask = new TestTask({
      garden,
      graph,
      action,
      log: garden.log,
      force: true,
      forceBuild: false,
    })

    const results = await garden.processTasks({ tasks: [testTask], throwOnError: true })
    const result = results.results.getResult(testTask)

    expect(result).to.exist
    expect(result?.outputs).to.exist
    expect(result!.result!.detail?.log.trim()).to.equal(action.getConfig().spec.namespace)
  })

  it("should fail if an error occurs, but store the result", async () => {
    const action = graph.getTest("artifacts-echo-test")
    action["_config"].spec.command = ["bork"] // this will fail

    const testTask = new TestTask({
      garden,
      graph,
      action,
      log: garden.log,
      force: true,
      forceBuild: false,
    })

    await expectError(
      async () => await garden.processTasks({ tasks: [testTask], throwOnError: true }),
      (err) => expect(err.message).to.match(/bork/)
    )

    const actions = await garden.getActionRouter()
    const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

    // We also verify that, despite the test failing, its result was still saved.
    const result = await actions.test.getResult({
      log: actionLog,
      action: await garden.resolveAction({ action, log: garden.log, graph }),
      graph,
    })

    expect(result).to.exist
  })

  context("artifacts are specified", () => {
    it("should copy artifacts out of the container", async () => {
      const action = graph.getTest("artifacts-artifacts-test")

      const testTask = new TestTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: true,
        forceBuild: false,
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks({ tasks: [testTask], throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
    })

    it("should fail if an error occurs, but copy the artifacts out of the container", async () => {
      const action = graph.getTest("artifacts-artifacts-test-fail")

      const testTask = new TestTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: true,
        forceBuild: false,
      })

      await emptyDir(garden.artifactsPath)

      const results = await garden.processTasks({ tasks: [testTask], throwOnError: false })

      expect(results.error).to.exist

      expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
    })

    it("should handle globs when copying artifacts out of the container", async () => {
      const action = graph.getTest("artifacts-globs-test")

      const testTask = new TestTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: true,
        forceBuild: false,
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks({ tasks: [testTask], throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
    })
  })
})
