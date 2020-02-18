/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { expectError } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { TaskTask } from "../../../../../../src/tasks/task"
import { emptyDir, pathExists } from "fs-extra"
import { join } from "path"
import { getContainerTestGarden } from "./container"
import { clearTaskResult } from "../../../../../../src/plugins/kubernetes/task-results"
import { Garden } from "../../../../../../src/garden"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { deline } from "../../../../../../src/util/string"

describe("runContainerTask", () => {
  let garden: Garden
  let graph: ConfigGraph
  let provider: KubernetesProvider

  before(async () => {
    garden = await getContainerTestGarden()
    provider = <KubernetesProvider>await garden.resolveProvider("local-kubernetes")
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph(garden.log)
  })

  after(async () => {
    await garden.close()
  })

  it("should run a basic task", async () => {
    const task = await graph.getTask("echo-task")
    const version = task.module.version

    const testTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      version,
    })

    const ctx = garden.getPluginContext(provider)
    await clearTaskResult({ ctx, log: garden.log, module: task.module, task, taskVersion: version })

    const key = testTask.getKey()
    const { [key]: result } = await garden.processTasks([testTask], { throwOnError: true })

    expect(result).to.exist
    expect(result!.output.log.trim()).to.equal("ok")
    expect(result!.output).to.have.property("outputs")
    expect(result!.output.outputs.log.trim()).to.equal("ok")

    // Verify that the result was saved
    const actions = await garden.getActionRouter()
    const storedResult = await actions.getTaskResult({
      log: garden.log,
      task,
      taskVersion: task.module.version,
    })

    expect(storedResult).to.exist
  })

  it("should not store task results if cacheResult=false", async () => {
    const task = await graph.getTask("echo-task")
    const version = task.module.version
    task.config.cacheResult = false

    const testTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      version,
    })

    const ctx = garden.getPluginContext(provider)
    await clearTaskResult({ ctx, log: garden.log, module: task.module, task, taskVersion: version })

    await garden.processTasks([testTask], { throwOnError: true })

    // Verify that the result was saved
    const actions = await garden.getActionRouter()
    const storedResult = await actions.getTaskResult({
      log: garden.log,
      task,
      taskVersion: task.module.version,
    })

    expect(storedResult).to.not.exist
  })

  it("should fail if an error occurs, but store the result", async () => {
    const task = await graph.getTask("echo-task")
    task.config.spec.command = ["bork"] // this will fail
    const version = task.module.version

    const testTask = new TaskTask({
      garden,
      graph,
      task,
      log: garden.log,
      force: true,
      forceBuild: false,
      version,
    })

    const ctx = garden.getPluginContext(provider)
    await clearTaskResult({ ctx, log: garden.log, module: task.module, task, taskVersion: version })

    await expectError(
      async () => await garden.processTasks([testTask], { throwOnError: true }),
      (err) => expect(err.message).to.match(/bork/)
    )

    // We also verify that, despite the task failing, its result was still saved.
    const actions = await garden.getActionRouter()
    const result = await actions.getTaskResult({
      log: garden.log,
      task,
      taskVersion: version,
    })

    expect(result).to.exist
  })

  context("artifacts are specified", () => {
    it("should copy artifacts out of the container", async () => {
      const task = await graph.getTask("artifacts-task")

      const testTask = new TaskTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        version: task.module.version,
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks([testTask], { throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "task.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "task.txt"))).to.be.true
    })

    it("should handle globs when copying artifacts out of the container", async () => {
      const task = await graph.getTask("globs-task")

      const testTask = new TaskTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        version: task.module.version,
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks([testTask], { throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "subdir", "task.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
    })

    it("should throw when container doesn't contain sh", async () => {
      const task = await graph.getTask("missing-sh-task")

      const testTask = new TaskTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        version: task.module.version,
      })

      const result = await garden.processTasks([testTask])

      const key = "task.missing-sh-task"

      expect(result).to.have.property(key)
      expect(result[key]!.error).to.exist
      expect(result[key]!.error!.message).to.equal(deline`
        Task 'missing-sh-task' in container module 'missing-sh' specifies artifacts to export, but the image doesn't
        contain the sh binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need
        to be installed in the image.
      `)
    })

    it("should throw when container doesn't contain tar", async () => {
      const task = await graph.getTask("missing-tar-task")

      const testTask = new TaskTask({
        garden,
        graph,
        task,
        log: garden.log,
        force: true,
        forceBuild: false,
        version: task.module.version,
      })

      const result = await garden.processTasks([testTask])

      const key = "task.missing-tar-task"

      expect(result).to.have.property(key)
      expect(result[key]!.error).to.exist
      expect(result[key]!.error!.message).to.equal(deline`
        Task 'missing-tar-task' in container module 'missing-tar' specifies artifacts to export, but the image doesn't
        contain the tar binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need
        to be installed in the image.
      `)
    })
  })
})
