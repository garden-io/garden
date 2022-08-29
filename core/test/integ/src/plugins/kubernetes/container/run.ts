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
import { RunTask } from "../../../../../../src/tasks/run"
import { emptyDir, pathExists } from "fs-extra"
import { join } from "path"
import { getContainerTestGarden } from "./container"
import { clearTaskResult } from "../../../../../../src/plugins/kubernetes/run-results"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { deline } from "../../../../../../src/util/string"

describe("runContainerTask", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let provider: KubernetesProvider

  before(async () => {
    garden = await getContainerTestGarden()
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    await garden.close()
  })

  it("should run a basic task and emit log events", async () => {
    const action = graph.getRun("echo-task-with-sleep")

    const testTask = new RunTask({
      garden,
      graph,
      action,
      log: garden.log,
      force: true,
      forceBuild: false,
      fromWatch: true,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })

    garden.events.eventLog = []

    const ctx = await garden.getPluginContext(provider)
    await clearTaskResult({ ctx, log: garden.log, action })

    const key = testTask.getBaseKey()
    const results = await garden.processTasks({ tasks: [testTask], throwOnError: true })
    const result = results.results.getResult(testTask)
    const logEvent = garden.events.eventLog.find((l) => l.name === "log" && l.payload["entity"]["type"] === "task")

    expect(result).to.exist
    expect(result!.result).to.exist
    expect(result!.result!.detail?.log.trim()).to.equal("ok\nbear")
    expect(result!.result).to.have.property("outputs")
    expect(result!.result!.outputs.log.trim()).to.equal("ok\nbear")
    expect(result!.result!.detail?.namespaceStatus).to.exist
    expect(logEvent).to.exist

    // Verify that the result was saved
    const actions = await garden.getActionRouter()
    const storedResult = await actions.run.getResult({
      log: garden.log,
      action: await garden.resolveAction({ action, log: garden.log, graph }),
      graph,
    })

    expect(storedResult).to.exist
  })

  it("should not store task results if cacheResult=false", async () => {
    const action = graph.getRun("echo-task")
    action.getConfig().spec.cacheResult = false

    const testTask = new RunTask({
      garden,
      graph,
      action,
      log: garden.log,
      force: true,
      forceBuild: false,
      fromWatch: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })

    const ctx = await garden.getPluginContext(provider)
    await clearTaskResult({ ctx, log: garden.log, action })

    await garden.processTasks({ tasks: [testTask], throwOnError: true })

    // Verify that the result was saved
    const actions = await garden.getActionRouter()
    const storedResult = await actions.run.getResult({
      log: garden.log,
      action: await garden.resolveAction({ action, log: garden.log, graph }),
      graph,
    })

    expect(storedResult).to.not.exist
  })

  it("should fail if an error occurs, but store the result", async () => {
    const action = graph.getRun("echo-task")
    action.getConfig().spec.command = ["bork"] // this will fail

    const testTask = new RunTask({
      garden,
      graph,
      action,
      log: garden.log,
      force: true,
      forceBuild: false,
      fromWatch: false,
      devModeDeployNames: [],
      localModeDeployNames: [],
    })

    const ctx = await garden.getPluginContext(provider)
    await clearTaskResult({ ctx, log: garden.log, action })

    await expectError(
      async () => await garden.processTasks({ tasks: [testTask], throwOnError: true }),
      (err) => expect(err.message).to.match(/bork/)
    )

    // We also verify that, despite the task failing, its result was still saved.
    const actions = await garden.getActionRouter()
    const result = await actions.run.getResult({
      log: garden.log,
      action: await garden.resolveAction({ action, log: garden.log, graph }),
      graph,
    })

    expect(result).to.exist
  })

  context("artifacts are specified", () => {
    it("should copy artifacts out of the container", async () => {
      const action = graph.getRun("artifacts-task")

      const testTask = new RunTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: true,
        forceBuild: false,
        fromWatch: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks({ tasks: [testTask], throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "task.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "task.txt"))).to.be.true
    })

    it("should fail if an error occurs, but copy the artifacts out of the container", async () => {
      const action = graph.getRun("artifacts-task-fail")

      const testTask = new RunTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: true,
        forceBuild: false,
        fromWatch: false,
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
      const action = graph.getRun("globs-task")

      const testTask = new RunTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: true,
        forceBuild: false,
        fromWatch: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks({ tasks: [testTask], throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "subdir", "task.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
    })

    it("should throw when container doesn't contain sh", async () => {
      const action = graph.getRun("missing-sh-task")

      const testTask = new RunTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: true,
        forceBuild: false,
        fromWatch: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

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
      const action = graph.getRun("missing-tar-task")

      const testTask = new RunTask({
        garden,
        graph,
        action,
        log: garden.log,
        force: true,
        forceBuild: false,
        fromWatch: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

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
