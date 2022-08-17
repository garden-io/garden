/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { expectError, TestGarden } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { getHelmTestGarden } from "./common"
import { RunTask } from "../../../../../../src/tasks/run"
import { emptyDir, pathExists } from "fs-extra"
import { join } from "path"
import { clearTaskResult } from "../../../../../../src/plugins/kubernetes/run-results"

describe("runHelmTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmTestGarden()
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  it("should run a basic task and store its result", async () => {
    const task = graph.getTask("echo-task")

    const testTask = new RunTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      devModeDeployNames: [],

      localModeDeployNames: [],
    })

    const key = testTask.getBaseKey()

    // Clear any existing task result
    const provider = await garden.resolveProvider(garden.log, "local-kubernetes")
    const ctx = await garden.getPluginContext(provider)
    await clearTaskResult({ ctx, log: garden.log, module: task.module, task })

    const { [key]: result } = await garden.processTasks({ tasks: [testTask], throwOnError: true })

    expect(result).to.exist
    expect(result).to.have.property("output")
    expect(result!.result.log.trim()).to.equal("ok")
    expect(result!.result).to.have.property("outputs")
    expect(result!.result.outputs.log.trim()).to.equal("ok")
    expect(result!.result.namespaceStatus).to.exist

    // We also verify that, despite the task failing, its result was still saved.
    const actions = await garden.getActionRouter()
    const storedResult = await actions.run.getResult({
      log: garden.log,
      task,
      graph,
    })

    expect(storedResult).to.exist
  })

  it("should not store task results if cacheResult=false", async () => {
    const task = graph.getTask("echo-task")
    task.config.cacheResult = false

    const testTask = new RunTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      devModeDeployNames: [],

      localModeDeployNames: [],
    })

    // Clear any existing task result
    const provider = await garden.resolveProvider(garden.log, "local-kubernetes")
    const ctx = await garden.getPluginContext(provider)
    await clearTaskResult({ ctx, log: garden.log, module: task.module, task })

    await garden.processTasks({ tasks: [testTask], throwOnError: true })

    // We also verify that, despite the task failing, its result was still saved.
    const actions = await garden.getActionRouter()
    const storedResult = await actions.run.getResult({
      log: garden.log,
      task,
      graph,
    })

    expect(storedResult).to.not.exist
  })

  it("should run a task in a different namespace, if configured", async () => {
    const task = graph.getTask("chart-with-namespace-task")

    const testTask = new RunTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      devModeDeployNames: [],

      localModeDeployNames: [],
    })

    const key = testTask.getBaseKey()
    const { [key]: result } = await garden.processTasks({ tasks: [testTask], throwOnError: true })

    expect(result).to.exist
    expect(result).to.have.property("output")
    expect(result!.result.log.trim()).to.equal(task.module.spec.namespace)
    expect(result!.result).to.have.property("outputs")
    expect(result!.result.outputs.log.trim()).to.equal(task.module.spec.namespace)
  })

  it("should fail if an error occurs, but store the result", async () => {
    const task = graph.getTask("echo-task")
    task.config.spec.command = ["bork"] // this will fail

    const testTask = new RunTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      devModeDeployNames: [],

      localModeDeployNames: [],
    })

    await expectError(
      async () => await garden.processTasks({ tasks: [testTask], throwOnError: true }),
      (err) => expect(err.message).to.match(/bork/)
    )

    const actions = await garden.getActionRouter()

    // We also verify that, despite the task failing, its result was still saved.
    const result = await actions.run.getResult({
      log: garden.log,
      task,
      graph,
    })

    expect(result).to.exist
  })

  context("artifacts are specified", () => {
    it("should copy artifacts out of the container", async () => {
      const task = graph.getTask("artifacts-task")

      const testTask = new RunTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        devModeDeployNames: [],

        localModeDeployNames: [],
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks({ tasks: [testTask], throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "task.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "task.txt"))).to.be.true
    })

    it("should fail if an error occurs, but copy the artifacts out of the container", async () => {
      const task = await graph.getTask("artifacts-task-fail")

      const testTask = new RunTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        devModeDeployNames: [],

        localModeDeployNames: [],
      })
      await emptyDir(garden.artifactsPath)

      const results = await garden.processTasks({ tasks: [testTask], throwOnError: false })

      expect(results[testTask.getBaseKey()]!.error).to.exist

      expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
    })

    it("should handle globs when copying artifacts out of the container", async () => {
      const task = graph.getTask("globs-task")

      const testTask = new RunTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        devModeDeployNames: [],

        localModeDeployNames: [],
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks({ tasks: [testTask], throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "subdir", "task.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
    })
  })
})
