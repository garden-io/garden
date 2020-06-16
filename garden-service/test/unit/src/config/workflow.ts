/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import { expectError, makeTestGardenA, TestGarden } from "../../../helpers"
import { WorkflowConfig, resolveWorkflowConfig } from "../../../../src/config/workflow"
import { defaultContainerLimits } from "../../../../src/plugins/container/config"

describe("resolveWorkflowConfig", () => {
  let garden: TestGarden

  const defaults = {
    limits: defaultContainerLimits,
    keepAliveHours: 48,
  }

  before(async () => {
    garden = await makeTestGardenA()
    garden["secrets"] = { foo: "bar" }
    garden["variables"] = { foo: "baz" }
  })

  it("should pass through a canonical workflow config", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Sample workflow",
      steps: [{ description: "Deploy the stack", command: ["deploy"] }, { command: ["test"] }],
      triggers: [
        {
          environment: "local",
          events: ["pull-request"],
          branches: ["feature*"],
          ignoreBranches: ["feature-ignored*"],
          tags: ["v1*"],
          ignoreTags: ["v1-ignored*"],
        },
      ],
    }

    expect(resolveWorkflowConfig(garden, config)).to.eql({
      ...config,
    })
  })

  it("should resolve template strings", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Secret: ${secrets.foo}, var: ${variables.foo}",
      steps: [{ description: "Deploy the stack", command: ["deploy"] }, { command: ["test"] }],
    }

    expect(resolveWorkflowConfig(garden, config)).to.eql({
      ...config,
      description: `Secret: bar, var: baz`,
    })
  })

  it("should populate default values in the schema", async () => {
    const config: WorkflowConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Description",
      steps: [{ description: "Deploy the stack", command: ["deploy"] }, { command: ["test"] }],
    }

    expect(resolveWorkflowConfig(garden, config)).to.eql({ ...config, ...defaults })
  })

  it("should throw if a step uses an invalid/unsupported command", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Sample workflow",
      steps: [
        { description: "Do something silly", command: ["bork"] }, // <------
        { command: ["test"] },
      ],
      triggers: [
        {
          environment: "local",
          events: ["pull-request"],
          branches: ["feature*"],
          ignoreBranches: ["feature-ignored*"],
          tags: ["v1*"],
          ignoreTags: ["v1-ignored*"],
        },
      ],
    }

    await expectError(
      () => resolveWorkflowConfig(garden, config),
      (err) => expect(err.message).to.match(/Invalid step command for workflow workflow-a/)
    )
  })

  it("should throw if a trigger uses an environment that isn't defined in the project", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Sample workflow",
      steps: [{ description: "Deploy the stack", command: ["deploy"] }, { command: ["test"] }],
      triggers: [
        {
          environment: "banana", // <-------
          events: ["pull-request"],
          branches: ["feature*"],
          ignoreBranches: ["feature-ignored*"],
          tags: ["v1*"],
          ignoreTags: ["v1-ignored*"],
        },
      ],
    }

    await expectError(
      () => resolveWorkflowConfig(garden, config),
      (err) => expect(err.message).to.match(/Invalid environment in trigger for workflow workflow-a/)
    )
  })
})
