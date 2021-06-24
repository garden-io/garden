/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import stripAnsi = require("strip-ansi")
import { keyBy } from "lodash"
import { ConfigContext } from "../../../../../src/config/template-contexts/base"
import { expectError, makeTestGardenA, TestGarden } from "../../../../helpers"
import { prepareRuntimeContext } from "../../../../../src/runtime-context"
import { GardenService } from "../../../../../src/types/service"
import { resolveTemplateString } from "../../../../../src/template-string/template-string"
import { ModuleConfigContext } from "../../../../../src/config/template-contexts/module"
import { WorkflowConfigContext, WorkflowStepConfigContext } from "../../../../../src/config/template-contexts/workflow"
import { GardenModule } from "../../../../../src/types/module"

type TestValue = string | ConfigContext | TestValues | TestValueFunction
type TestValueFunction = () => TestValue | Promise<TestValue>
interface TestValues {
  [key: string]: TestValue
}

let currentBranch: string

describe("ModuleConfigContext", () => {
  let garden: TestGarden
  let c: ModuleConfigContext
  let module: GardenModule

  before(async () => {
    garden = await makeTestGardenA()
    garden["secrets"] = { someSecret: "someSecretValue" }
    const graph = await garden.getConfigGraph(garden.log)
    const modules = graph.getModules()
    module = graph.getModule("module-b")
    currentBranch = garden.vcsBranch

    c = new ModuleConfigContext({
      garden,
      resolvedProviders: keyBy(await garden.resolveProviders(garden.log), "name"),
      variables: garden.variables,
      modules,
      moduleConfig: module,
      buildPath: module.buildPath,
      partialRuntimeResolution: false,
    })
  })

  it("should resolve local env variables", async () => {
    process.env.TEST_VARIABLE = "foo"
    expect(c.resolve({ key: ["local", "env", "TEST_VARIABLE"], nodePath: [], opts: {} })).to.eql({
      resolved: "foo",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve the local platform", async () => {
    expect(c.resolve({ key: ["local", "platform"], nodePath: [], opts: {} })).to.eql({
      resolved: process.platform,
    })
  })

  it("should resolve the environment config", async () => {
    expect(c.resolve({ key: ["environment", "name"], nodePath: [], opts: {} })).to.eql({
      resolved: garden.environmentName,
    })
  })

  it("should resolve the current git branch", () => {
    expect(c.resolve({ key: ["git", "branch"], nodePath: [], opts: {} })).to.eql({
      resolved: currentBranch,
    })
  })

  it("should resolve the path of a module", async () => {
    const path = join(garden.projectRoot, "module-a")
    expect(c.resolve({ key: ["modules", "module-a", "path"], nodePath: [], opts: {} })).to.eql({ resolved: path })
  })

  it("should should resolve the version of a module", async () => {
    const config = await garden.resolveModule("module-a")
    const { versionString } = await garden.resolveModuleVersion(config, [])
    expect(c.resolve({ key: ["modules", "module-a", "version"], nodePath: [], opts: {} })).to.eql({
      resolved: versionString,
    })
  })

  it("should resolve the outputs of a module", async () => {
    expect(c.resolve({ key: ["modules", "module-a", "outputs", "foo"], nodePath: [], opts: {} })).to.eql({
      resolved: "bar",
    })
  })

  it("should resolve this.buildPath", async () => {
    expect(c.resolve({ key: ["this", "buildPath"], nodePath: [], opts: {} })).to.eql({
      resolved: module.buildPath,
    })
  })

  it("should resolve this.path", async () => {
    expect(c.resolve({ key: ["this", "path"], nodePath: [], opts: {} })).to.eql({
      resolved: module.path,
    })
  })

  it("should resolve this.name", async () => {
    expect(c.resolve({ key: ["this", "name"], nodePath: [], opts: {} })).to.eql({
      resolved: module.name,
    })
  })

  it("should resolve a project variable", async () => {
    expect(c.resolve({ key: ["variables", "some"], nodePath: [], opts: {} })).to.eql({ resolved: "variable" })
  })

  it("should resolve a project variable under the var alias", async () => {
    expect(c.resolve({ key: ["var", "some"], nodePath: [], opts: {} })).to.eql({ resolved: "variable" })
  })

  context("secrets", () => {
    it("should resolve a secret", async () => {
      expect(c.resolve({ key: ["secrets", "someSecret"], nodePath: [], opts: {} })).to.eql({
        resolved: "someSecretValue",
      })
    })
  })

  context("runtimeContext is set", () => {
    let withRuntime: ModuleConfigContext
    let serviceA: GardenService

    before(async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const modules = graph.getModules()
      serviceA = graph.getService("service-a")
      const serviceB = graph.getService("service-b")
      const taskB = graph.getTask("task-b")

      const runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          deploy: [serviceB],
          run: [taskB],
          test: [],
        },
        version: serviceA.version,
        moduleVersion: serviceA.module.version.versionString,
        serviceStatuses: {
          "service-b": {
            state: "ready",
            outputs: { foo: "bar" },
            detail: {},
          },
        },
        taskResults: {
          "task-b": {
            moduleName: "module-b",
            taskName: "task-b",
            command: [],
            outputs: { moo: "boo" },
            success: true,
            version: taskB.version,
            startedAt: new Date(),
            completedAt: new Date(),
            log: "boo",
          },
        },
      })

      withRuntime = new ModuleConfigContext({
        garden,
        resolvedProviders: keyBy(await garden.resolveProviders(garden.log), "name"),
        variables: garden.variables,
        modules,
        moduleConfig: serviceA.module,
        buildPath: serviceA.module.buildPath,
        runtimeContext,
        partialRuntimeResolution: false,
      })
    })

    it("should resolve service outputs", async () => {
      const result = withRuntime.resolve({
        key: ["runtime", "services", "service-b", "outputs", "foo"],
        nodePath: [],
        opts: {},
      })
      expect(result).to.eql({ resolved: "bar" })
    })

    it("should resolve task outputs", async () => {
      const result = withRuntime.resolve({
        key: ["runtime", "tasks", "task-b", "outputs", "moo"],
        nodePath: [],
        opts: {},
      })
      expect(result).to.eql({ resolved: "boo" })
    })

    it("should allow using a runtime key as a test in a ternary (positive)", async () => {
      const result = resolveTemplateString(
        "${runtime.tasks.task-b ? runtime.tasks.task-b.outputs.moo : 'default'}",
        withRuntime
      )
      expect(result).to.equal("boo")
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
    expect(c.resolve({ key: ["local", "env", "TEST_VARIABLE"], nodePath: [], opts: {} })).to.eql({
      resolved: "foo",
    })
    delete process.env.TEST_VARIABLE
  })

  it("should resolve the local platform", async () => {
    expect(c.resolve({ key: ["local", "platform"], nodePath: [], opts: {} })).to.eql({
      resolved: process.platform,
    })
  })

  it("should resolve the current git branch", () => {
    expect(c.resolve({ key: ["git", "branch"], nodePath: [], opts: {} })).to.eql({
      resolved: currentBranch,
    })
  })

  it("should resolve the environment config", async () => {
    expect(c.resolve({ key: ["environment", "name"], nodePath: [], opts: {} })).to.eql({
      resolved: garden.environmentName,
    })
  })

  it("should resolve a project variable", async () => {
    expect(c.resolve({ key: ["variables", "some"], nodePath: [], opts: {} })).to.eql({ resolved: "variable" })
  })

  it("should resolve a project variable under the var alias", async () => {
    expect(c.resolve({ key: ["var", "some"], nodePath: [], opts: {} })).to.eql({ resolved: "variable" })
  })

  context("secrets", () => {
    it("should resolve a secret", async () => {
      expect(c.resolve({ key: ["secrets", "someSecret"], nodePath: [], opts: {} })).to.eql({
        resolved: "someSecretValue",
      })
    })
  })
})

describe("WorkflowStepConfigContext", () => {
  let garden: TestGarden

  before(async () => {
    garden = await makeTestGardenA()
  })

  it("should successfully resolve an output from a prior resolved step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {
        "step-1": {
          log: "bla",
          number: 1,
          outputs: { some: "value" },
        },
      },
      stepName: "step-2",
    })
    expect(c.resolve({ key: ["steps", "step-1", "outputs", "some"], nodePath: [], opts: {} }).resolved).to.equal(
      "value"
    )
  })

  it("should successfully resolve the log from a prior resolved step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {
        "step-1": {
          log: "bla",
          number: 1,
          outputs: {},
        },
      },
      stepName: "step-2",
    })
    expect(c.resolve({ key: ["steps", "step-1", "log"], nodePath: [], opts: {} }).resolved).to.equal("bla")
  })

  it("should throw error when attempting to reference a following step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {},
      stepName: "step-1",
    })
    expectError(
      () => c.resolve({ key: ["steps", "step-2", "log"], nodePath: [], opts: {} }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Step step-2 is referenced in a template for step step-1, but step step-2 is later in the execution order. Only previous steps in the workflow can be referenced."
        )
    )
  })

  it("should throw error when attempting to reference current step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {},
      stepName: "step-1",
    })
    expectError(
      () => c.resolve({ key: ["steps", "step-1", "log"], nodePath: [], opts: {} }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Step step-1 references itself in a template. Only previous steps in the workflow can be referenced."
        )
    )
  })
})
