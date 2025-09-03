/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { TestGarden } from "../../../../helpers.js"
import { expectError, makeTestGardenA } from "../../../../helpers.js"
import {
  WorkflowConfigContext,
  WorkflowStepConfigContext,
} from "../../../../../src/config/template-contexts/workflow.js"
import type { WorkflowConfig } from "../../../../../src/config/workflow.js"
import { defaultWorkflowResources } from "../../../../../src/config/workflow.js"
import { GardenApiVersion } from "../../../../../src/constants.js"

describe("WorkflowConfigContext", () => {
  let garden: TestGarden
  let c: WorkflowConfigContext

  before(async () => {
    garden = await makeTestGardenA()
    garden["secrets"] = { someSecret: "someSecretValue" }
    garden.localEnvOverrides.TEST_VARIABLE = "foo"
    c = new WorkflowConfigContext(garden, garden.variables)
  })

  it("should resolve local env variables", async () => {
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
    expect(c.resolve({ nodePath: [], key: ["steps", "step-1", "outputs", "some"], opts: {} })).to.deep.eq({
      found: true,
      resolved: "value",
    })
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
    expect(c.resolve({ nodePath: [], key: ["steps", "step-1", "log"], opts: {} })).to.deep.equal({
      found: true,
      resolved: "bla",
    })
  })

  it("should throw error when attempting to reference a following step", () => {
    const c = new WorkflowStepConfigContext({
      garden,
      workflow,
      allStepNames: ["step-1", "step-2"],
      resolvedSteps: {},
      stepName: "step-1",
    })
    void expectError(() => c.resolve({ nodePath: [], key: ["steps", "step-2", "log"], opts: {} }), {
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
    void expectError(() => c.resolve({ nodePath: [], key: ["steps", "step-1", "log"], opts: {} }), {
      contains: "Step step-1 references itself in a template. Only previous steps in the workflow can be referenced.",
    })
  })
})
