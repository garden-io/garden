/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { TestGarden, expectError } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { getKubernetesTestGarden } from "./common"
import { TestTask } from "../../../../../../src/tasks/test"
import { findByName } from "../../../../../../src/util/util"
import { emptyDir, pathExists } from "fs-extra"
import { join } from "path"
import { testFromModule, testFromConfig } from "../../../../../../src/types/test"

describe("testKubernetesModule", () => {
  let garden: TestGarden
  let graph: ConfigGraph

  before(async () => {
    garden = await getKubernetesTestGarden()
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  it("should run a basic test", async () => {
    const module = graph.getModule("module-simple")

    const testTask = new TestTask({
      garden,
      graph,
      test: testFromModule(module, "echo-test", graph),
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
    expect(result!.result.log.trim()).to.equal("ok")
    expect(result!.result.namespaceStatus).to.exist
    expect(result!.result.namespaceStatus.namespaceName).to.equal("kubernetes-module-test-default")
  })

  it("should run a test in different namespace, if configured", async () => {
    const module = graph.getModule("with-namespace")

    const testTask = new TestTask({
      garden,
      graph,
      test: testFromModule(module, "with-namespace-test", graph),
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
    expect(result!.result.log.trim()).to.equal(module.spec.namespace)
    expect(result!.result.namespaceStatus).to.exist
    expect(result!.result.namespaceStatus.namespaceName).to.equal(module.spec.namespace)
  })

  it("should fail if an error occurs, but store the result", async () => {
    const module = graph.getModule("artifacts")

    const testConfig = findByName(module.testConfigs, "echo-test")!
    testConfig.spec.command = ["bork"] // this will fail

    const test = testFromConfig(module, testConfig, graph)

    const testTask = new TestTask({
      garden,
      graph,
      test,
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

    // We also verify that, despite the test failing, its result was still saved.
    const result = await actions.test.getResult({
      log: garden.log,
      module,
      test,
      graph,
    })

    expect(result).to.exist
  })

  context("artifacts are specified", () => {
    it("should copy artifacts out of the container", async () => {
      const module = graph.getModule("artifacts")

      const testTask = new TestTask({
        garden,
        graph,
        test: testFromModule(module, "artifacts-test", graph),
        log: garden.log,
        force: true,
        forceBuild: false,
        devModeDeployNames: [],

        localModeDeployNames: [],
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks({ tasks: [testTask], throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
    })

    it("should fail if an error occurs, but copy the artifacts out of the container", async () => {
      const module = graph.getModule("artifacts")

      const testTask = new TestTask({
        garden,
        graph,
        test: testFromModule(module, "artifacts-test-fail", graph),
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
      const module = graph.getModule("artifacts")

      const testTask = new TestTask({
        garden,
        graph,
        test: testFromModule(module, "globs-test", graph),
        log: garden.log,
        force: true,
        forceBuild: false,
        devModeDeployNames: [],

        localModeDeployNames: [],
      })

      await emptyDir(garden.artifactsPath)

      await garden.processTasks({ tasks: [testTask], throwOnError: true })

      expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
      expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
    })
  })
})
