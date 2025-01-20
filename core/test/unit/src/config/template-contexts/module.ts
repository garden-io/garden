/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import { keyBy } from "lodash-es"
import type { TestGarden } from "../../../../helpers.js"
import { makeTestGardenA } from "../../../../helpers.js"
import { ModuleConfigContext } from "../../../../../src/config/template-contexts/module.js"
import { WorkflowConfigContext } from "../../../../../src/config/template-contexts/workflow.js"
import type { GardenModule } from "../../../../../src/types/module.js"
import type { ConfigGraph } from "../../../../../src/graph/config-graph.js"

describe("ModuleConfigContext", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let c: ModuleConfigContext
  let module: GardenModule

  before(async () => {
    garden = await makeTestGardenA()
    garden["secrets"] = { someSecret: "someSecretValue" }
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const modules = graph.getModules()
    module = graph.getModule("module-b")

    c = new ModuleConfigContext({
      garden,
      resolvedProviders: keyBy(await garden.resolveProviders({ log: garden.log }), "name"),
      variables: garden.variables,
      modules,
      buildPath: module.buildPath,
      name: module.name,
      path: module.path,
      parentName: module.parentName,
      inputs: module.inputs,
      templateName: module.templateName,
    })
  })

  it("should resolve local env variables", async () => {
    process.env.TEST_VARIABLE = "foo"
    expect(c.resolve({ key: ["local", "env", "TEST_VARIABLE"], opts: {} })).to.eql({
      resolved: "foo",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve the local arch", async () => {
    expect(c.resolve({ key: ["local", "arch"], opts: {} })).to.eql({
      resolved: process.arch,
    })
  })

  it("should resolve the local platform", async () => {
    expect(c.resolve({ key: ["local", "platform"], opts: {} })).to.eql({
      resolved: process.platform,
    })
  })

  it("should resolve the environment config", async () => {
    expect(c.resolve({ key: ["environment", "name"], opts: {} })).to.eql({
      resolved: garden.environmentName,
    })
  })

  it("should resolve the current git branch", () => {
    expect(c.resolve({ key: ["git", "branch"], opts: {} })).to.eql({
      resolved: garden.vcsInfo.branch,
    })
  })

  it("should resolve the path of a module", async () => {
    const path = join(garden.projectRoot, "module-a")
    expect(c.resolve({ key: ["modules", "module-a", "path"], opts: {} })).to.eql({ resolved: path })
  })

  it("should should resolve the version of a module", async () => {
    const { versionString } = graph.getModule("module-a").version
    expect(c.resolve({ key: ["modules", "module-a", "version"], opts: {} })).to.eql({
      resolved: versionString,
    })
  })

  it("should resolve the outputs of a module", async () => {
    expect(c.resolve({ key: ["modules", "module-a", "outputs", "foo"], opts: {} })).to.eql({
      resolved: "bar",
    })
  })

  it("should resolve this.buildPath", async () => {
    expect(c.resolve({ key: ["this", "buildPath"], opts: {} })).to.eql({
      resolved: module.buildPath,
    })
  })

  it("should resolve this.path", async () => {
    expect(c.resolve({ key: ["this", "path"], opts: {} })).to.eql({
      resolved: module.path,
    })
  })

  it("should resolve this.name", async () => {
    expect(c.resolve({ key: ["this", "name"], opts: {} })).to.eql({
      resolved: module.name,
    })
  })

  it("should resolve a project variable", async () => {
    expect(c.resolve({ key: ["variables", "some"], opts: {} })).to.eql({ resolved: "variable" })
  })

  it("should resolve a project variable under the var alias", async () => {
    expect(c.resolve({ key: ["var", "some"], opts: {} })).to.eql({ resolved: "variable" })
  })

  context("secrets", () => {
    it("should resolve a secret", async () => {
      expect(c.resolve({ key: ["secrets", "someSecret"], opts: {} })).to.eql({
        resolved: "someSecretValue",
      })
    })
  })
})

describe("WorkflowConfigContext", () => {
  let garden: TestGarden
  let c: WorkflowConfigContext

  before(async () => {
    garden = await makeTestGardenA()
    garden["secrets"] = { someSecret: "someSecretValue" }
    c = new WorkflowConfigContext(garden, garden.variables)
  })

  it("should resolve local env variables", async () => {
    process.env.TEST_VARIABLE = "foo"
    expect(c.resolve({ key: ["local", "env", "TEST_VARIABLE"], opts: {} })).to.eql({
      resolved: "foo",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve the local platform", async () => {
    expect(c.resolve({ key: ["local", "platform"], opts: {} })).to.eql({
      resolved: process.platform,
    })
  })

  it("should resolve the current git branch", () => {
    expect(c.resolve({ key: ["git", "branch"], opts: {} })).to.eql({
      resolved: garden.vcsInfo.branch,
    })
  })

  it("should resolve the environment config", async () => {
    expect(c.resolve({ key: ["environment", "name"], opts: {} })).to.eql({
      resolved: garden.environmentName,
    })
  })

  it("should resolve a project variable", async () => {
    expect(c.resolve({ key: ["variables", "some"], opts: {} })).to.eql({ resolved: "variable" })
  })

  it("should resolve a project variable under the var alias", async () => {
    expect(c.resolve({ key: ["var", "some"], opts: {} })).to.eql({ resolved: "variable" })
  })

  context("secrets", () => {
    it("should resolve a secret", async () => {
      expect(c.resolve({ key: ["secrets", "someSecret"], opts: {} })).to.eql({
        resolved: "someSecretValue",
      })
    })
  })
})
