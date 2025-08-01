/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
import { InputContext } from "../../../../../src/config/template-contexts/input.js"

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
      inputs: InputContext.forModule(garden, module),
      templateName: undefined,
      templatePath: undefined,
      // templateName: module.templateName,
      // templatePath: module.templatePath ? relative(garden.projectRoot, module.templatePath) : undefined,
    })
  })

  it("should resolve local env variables", async () => {
    process.env.TEST_VARIABLE = "foo"
    expect(c.resolve({ nodePath: [], key: ["local", "env", "TEST_VARIABLE"], opts: {} })).to.eql({
      found: true,
      resolved: "foo",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve the local arch", async () => {
    expect(c.resolve({ nodePath: [], key: ["local", "arch"], opts: {} })).to.eql({
      found: true,
      resolved: process.arch,
    })
  })

  it("should resolve the local platform", async () => {
    expect(c.resolve({ nodePath: [], key: ["local", "platform"], opts: {} })).to.eql({
      found: true,
      resolved: process.platform,
    })
  })

  it("should resolve the environment config", async () => {
    expect(c.resolve({ nodePath: [], key: ["environment", "name"], opts: {} })).to.eql({
      found: true,
      resolved: garden.environmentName,
    })
  })

  it("should resolve the current git branch", () => {
    expect(c.resolve({ nodePath: [], key: ["git", "branch"], opts: {} })).to.eql({
      found: true,
      resolved: garden.vcsInfo.branch,
    })
  })

  it("should resolve the path of a module", async () => {
    const path = join(garden.projectRoot, "module-a")
    expect(c.resolve({ nodePath: [], key: ["modules", "module-a", "path"], opts: {} })).to.eql({
      found: true,
      resolved: path,
    })
  })

  it("should should resolve the version of a module", async () => {
    const { versionString } = graph.getModule("module-a").version
    expect(c.resolve({ nodePath: [], key: ["modules", "module-a", "version"], opts: {} })).to.eql({
      found: true,
      resolved: versionString,
    })
  })

  it("should resolve the outputs of a module", async () => {
    expect(c.resolve({ nodePath: [], key: ["modules", "module-a", "outputs", "foo"], opts: {} })).to.eql({
      found: true,
      resolved: "bar",
    })
  })

  it("should resolve this.buildPath", async () => {
    expect(c.resolve({ nodePath: [], key: ["this", "buildPath"], opts: {} })).to.eql({
      found: true,
      resolved: module.buildPath,
    })
  })

  it("should resolve this.path", async () => {
    expect(c.resolve({ nodePath: [], key: ["this", "path"], opts: {} })).to.eql({
      found: true,
      resolved: module.path,
    })
  })

  it("should resolve this.name", async () => {
    expect(c.resolve({ nodePath: [], key: ["this", "name"], opts: {} })).to.eql({
      found: true,
      resolved: module.name,
    })
  })

  it("should resolve a project variable", async () => {
    expect(c.resolve({ nodePath: [], key: ["variables", "some"], opts: {} })).to.eql({
      found: true,
      resolved: "variable",
    })
  })

  it("should resolve a project variable under the var alias", async () => {
    expect(c.resolve({ nodePath: [], key: ["var", "some"], opts: {} })).to.eql({
      found: true,
      resolved: "variable",
    })
  })

  context("secrets", () => {
    it("should resolve a secret", async () => {
      expect(c.resolve({ nodePath: [], key: ["secrets", "someSecret"], opts: {} })).to.eql({
        found: true,
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
    expect(c.resolve({ nodePath: [], key: ["local", "env", "TEST_VARIABLE"], opts: {} })).to.eql({
      found: true,
      resolved: "foo",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve the local platform", async () => {
    expect(c.resolve({ nodePath: [], key: ["local", "platform"], opts: {} })).to.eql({
      found: true,
      resolved: process.platform,
    })
  })

  it("should resolve the current git branch", () => {
    expect(c.resolve({ nodePath: [], key: ["git", "branch"], opts: {} })).to.eql({
      found: true,
      resolved: garden.vcsInfo.branch,
    })
  })

  it("should resolve the environment config", async () => {
    expect(c.resolve({ nodePath: [], key: ["environment", "name"], opts: {} })).to.eql({
      found: true,
      resolved: garden.environmentName,
    })
  })

  it("should resolve a project variable", async () => {
    expect(c.resolve({ nodePath: [], key: ["variables", "some"], opts: {} })).to.eql({
      found: true,
      resolved: "variable",
    })
  })

  it("should resolve a project variable under the var alias", async () => {
    expect(c.resolve({ nodePath: [], key: ["var", "some"], opts: {} })).to.eql({
      found: true,
      resolved: "variable",
    })
  })

  context("secrets", () => {
    it("should resolve a secret", async () => {
      expect(c.resolve({ nodePath: [], key: ["secrets", "someSecret"], opts: {} })).to.eql({
        found: true,
        resolved: "someSecretValue",
      })
    })
  })
})
