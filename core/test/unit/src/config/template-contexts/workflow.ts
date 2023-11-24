/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { ConfigContext } from "../../../../../src/config/template-contexts/base.js"
import type { TestGarden } from "../../../../helpers.js"
import { expectError, makeTestGardenA } from "../../../../helpers.js"
import {
  WorkflowConfigContext,
  WorkflowStepConfigContext,
} from "../../../../../src/config/template-contexts/workflow.js"
import type { WorkflowConfig } from "../../../../../src/config/workflow.js"
import { defaultWorkflowResources } from "../../../../../src/config/workflow.js"
import { GardenApiVersion } from "../../../../../src/constants.js"

type TestValue = string | ConfigContext | TestValues | TestValueFunction
type TestValueFunction = () => TestValue | Promise<TestValue>

interface TestValues {
  [key: string]: TestValue
}

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

  it("should resolve the local arch", async () => {
    expect(c.resolve({ key: ["local", "arch"], nodePath: [], opts: {} })).to.eql({
      resolved: process.arch,
    })
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

  const workflow: WorkflowConfig = {
    apiVersion: GardenApiVersion.v0,
    kind: "Workflow",
    name: "test",
    steps: [],
    envVars: {},
    resources: defaultWorkflowResources,

    internal: {
      basePath: "/tmp",
    },
  }

  before(async () => {
    garden = await makeTestGardenA()
  })

  it("should successfully resolve an output from a prior resolved step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      workflow,
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
    expect(c.resolve({ key: ["steps", "step-1", "outputs", "some"], nodePath: [], opts: {} }).result).to.equal(
      "value"
    )
  })

  it("should successfully resolve the log from a prior resolved step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      workflow,
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
    expect(c.resolve({ key: ["steps", "step-1", "log"], nodePath: [], opts: {} }).result).to.equal("bla")
  })

  it("should throw error when attempting to reference a following step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      workflow,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {},
      stepName: "step-1",
    })
    void expectError(() => c.resolve({ key: ["steps", "step-2", "log"], nodePath: [], opts: {} }), {
      contains:
        "Step step-2 is referenced in a template for step step-1, but step step-2 is later in the execution order. Only previous steps in the workflow can be referenced.",
    })
  })

  it("should throw error when attempting to reference current step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      workflow,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {},
      stepName: "step-1",
    })
    void expectError(() => c.resolve({ key: ["steps", "step-1", "log"], nodePath: [], opts: {} }), {
      contains: "Step step-1 references itself in a template. Only previous steps in the workflow can be referenced.",
    })
  })
})
