/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from "../../../../../src/garden"
import { getDataDir } from "../../../../helpers"
import { expect } from "chai"
import stripAnsi = require("strip-ansi")
import { dedent } from "../../../../../src/util/string"
import { TestTask } from "../../../../../src/tasks/test"

describe("conftest-kubernetes provider", () => {
  const projectRoot = getDataDir("test-projects", "conftest-kubernetes")

  it("should add a conftest module for each helm module, and add runtime dependencies as necessary", async () => {
    const garden = await Garden.factory(projectRoot)

    const graph = await garden.getConfigGraph(garden.log)
    const helmModule = graph.getModule("helm")
    const module = graph.getModule("conftest-helm")

    expect(module.type).to.equal("conftest-helm")
    expect(module.path).to.equal(helmModule.path)
    expect(module.spec).to.eql({
      build: { dependencies: [] },
      namespace: "main",
      policyPath: "../custom-policy",
      sourceModule: "helm",
      combine: false,
      runtimeDependencies: ["kubernetes"],
    })
  })

  it("should add a conftest module for each kubernetes module", async () => {
    const garden = await Garden.factory(projectRoot)

    const graph = await garden.getConfigGraph(garden.log)
    const kubernetesModule = graph.getModule("kubernetes")
    const module = graph.getModule("conftest-kubernetes")

    expect(module.path).to.equal(kubernetesModule.path)
    expect(module.spec).to.eql({
      build: { dependencies: [] },
      files: kubernetesModule.spec.files,
      namespace: "main",
      policyPath: "../custom-policy",
      combine: false,
      sourceModule: "kubernetes",
    })
  })

  describe("conftest-helm module", () => {
    it("should be able to test files in a remote Helm chart", async () => {
      const garden = await Garden.factory(projectRoot)

      const graph = await garden.getConfigGraph(garden.log)
      const module = graph.getModule("conftest-helm")

      const testTask = new TestTask({
        garden,
        module,
        log: garden.log,
        graph,
        testConfig: module.testConfigs[0],
        force: true,
        forceBuild: true,
        version: module.version,
        _guard: true,
      })

      const key = testTask.getKey()
      const res = await garden.processTasks([testTask])
      const { [key]: result } = res

      expect(result).to.exist
      expect(result!.error).to.exist
      expect(stripAnsi(result!.error!.message)).to.equal(dedent`
      conftest reported 1 failure(s):

      FAIL -  - StatefulSet replicas should not be 1
      `)
    })
  })
})
