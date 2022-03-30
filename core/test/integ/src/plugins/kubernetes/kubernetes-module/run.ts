/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { TestGarden, expectError } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { getKubernetesTestGarden } from "./common"
import { TaskTask } from "../../../../../../src/tasks/task"
import { emptyDir, pathExists } from "fs-extra"
import { join } from "path"
import { clearTaskResult } from "../../../../../../src/plugins/kubernetes/task-results"

describe("runKubernetesTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph

  before(async () => {
    garden = await getKubernetesTestGarden()
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  it("should run a basic task and store its result", async () => {
    const task = graph.getTask("echo-task")

    const testTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
    })

    // Clear any existing task result
    const provider = await garden.resolveProvider(garden.log, "local-kubernetes")
    const ctx = await garden.getPluginContext(provider)
    await clearTaskResult({ ctx, log: garden.log, module: task.module, task })

    const key = testTask.getKey()
    const { [key]: result } = await garden.processTasks([testTask], { throwOnError: true })

    expect(result).to.exist
    expect(result).to.have.property("output")
    expect(result!.output.log.trim()).to.equal("ok")
    expect(result!.output).to.have.property("outputs")
    expect(result!.output.outputs.log.trim()).to.equal("ok")
    expect(result!.output.namespaceStatus).to.exist

    // Verify that the result was saved
    const actions = await garden.getActionRouter()
    const storedResult = await actions.getTaskResult({
      log: garden.log,
      task,
      graph,
    })

    expect(storedResult).to.exist
  })

  it("should not store task results if cacheResult=false", async () => {
    const task = graph.getTask("echo-task")
    task.config.cacheResult = false

    const testTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
    })

    // Clear any existing task result
    const provider = await garden.resolveProvider(garden.log, "local-kubernetes")
    const ctx = await garden.getPluginContext(provider)
    await clearTaskResult({ ctx, log: garden.log, module: task.module, task })

    await garden.processTasks([testTask], { throwOnError: true })

    // Verify that the result was saved
    const actions = await garden.getActionRouter()
    const storedResult = await actions.getTaskResult({
      log: garden.log,
      task,
      graph,
    })

    expect(storedResult).to.not.exist
  })

  it("should run a task in a different namespace, if configured", async () => {
    const task = graph.getTask("with-namespace-task")

    const testTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
    })

    const key = testTask.getKey()
    const { [key]: result } = await garden.processTasks([testTask], { throwOnError: true })

    expect(result).to.exist
    expect(result).to.have.property("output")
    expect(result!.output.log.trim()).to.equal(task.module.spec.namespace)
    expect(result!.output).to.have.property("outputs")
    expect(result!.output.outputs.log.trim()).to.equal(task.module.spec.namespace)
  })

  it("should fail if an error occurs, but store the result", async () => {
    const task = graph.getTask("echo-task")
    task.config.spec.command = ["bork"] // this will fail

    const testTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
    })

    await expectError(
      async () => await garden.processTasks([testTask], { throwOnError: true }),
      (err) => expect(err.message).to.match(/bork/)
    )

    const actions = await garden.getActionRouter()

    // We also verify that, despite the task failing, its result was still saved.
    const result = await actions.getTaskResult({
      log: garden.log,
      task,
      graph,
    })

    expect(result).to.exist
  })

  context("artifacts are specified", () => {
    it("should copy artifacts out of the container", async () => {
      const task = graph.getTask("artifacts-task")

      const testTask = new TaskTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks([testTask], { throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "task.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "task.txt"))).to.be.true
    })

    it("should fail if an error occurs, but copy the artifacts out of the container", async () => {
      const task = graph.getTask("artifacts-task-fail")

      const testTask = new TaskTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })
      await emptyDir(garden.artifactsPath)

      const results = await garden.processTasks([testTask], { throwOnError: false })

      expect(results[testTask.getKey()]!.error).to.exist

      expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
    })

    it("should handle globs when copying artifacts out of the container", async () => {
      const task = graph.getTask("globs-task")

      const testTask = new TaskTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks([testTask], { throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "subdir", "task.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
    })
  })
})
