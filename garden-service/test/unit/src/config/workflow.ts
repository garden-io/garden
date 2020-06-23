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
import {
  WorkflowConfig,
  resolveWorkflowConfig,
  populateNamespaceForTriggers,
  TriggerSpec,
} from "../../../../src/config/workflow"
import { defaultContainerLimits } from "../../../../src/plugins/container/config"
import { EnvironmentConfig } from "../../../../src/config/project"

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
          namespace: undefined,
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

  describe("populateNamespaceForTriggers", () => {
    const trigger: TriggerSpec = {
      environment: "test",
      events: ["pull-request"],
      branches: ["feature*"],
      ignoreBranches: ["feature-ignored*"],
      tags: ["v1*"],
      ignoreTags: ["v1-ignored*"],
    }
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Sample workflow",
      steps: [{ description: "Deploy the stack", command: ["deploy"] }, { command: ["test"] }],
    }

    it("should pass through a trigger without a namespace when namespacing is optional", () => {
      const environmentConfigs: EnvironmentConfig[] = [
        {
          name: "test",
          namespacing: "optional",
          variables: {},
        },
      ]

      // config's only trigger has no namespace defined
      populateNamespaceForTriggers(config, environmentConfigs)
    })

    it("should throw if a trigger's environment requires a namespace, but none is specified", () => {
      const environmentConfigs: EnvironmentConfig[] = [
        {
          name: "test",
          namespacing: "required",
          variables: {},
        },
      ]

      expectError(
        () => populateNamespaceForTriggers({ ...config, triggers: [trigger] }, environmentConfigs),
        (err) =>
          expect(err.message).to.match(
            /Invalid namespace in trigger for workflow workflow-a: Environment test requires a namespace/
          )
      )
    })

    it("should throw if a trigger's environment does not allow namespaces, but one is specified", () => {
      const environmentConfigs: EnvironmentConfig[] = [
        {
          name: "test",
          namespacing: "disabled",
          variables: {},
        },
      ]

      const invalidTrigger = { ...trigger, namespace: "foo" }

      expectError(
        () => populateNamespaceForTriggers({ ...config, triggers: [invalidTrigger] }, environmentConfigs),
        (err) =>
          expect(err.message).to.match(
            /Invalid namespace in trigger for workflow workflow-a: Environment test does not allow namespacing/
          )
      )
    })

    it("should populate the trigger with a default namespace if one is defined", () => {
      const environmentConfigs: EnvironmentConfig[] = [
        {
          name: "test",
          namespacing: "optional",
          defaultNamespace: "foo",
          variables: {},
        },
      ]

      const configToPopulate = { ...config, triggers: [trigger] }
      populateNamespaceForTriggers(configToPopulate, environmentConfigs)
      expect(configToPopulate.triggers![0].namespace).to.eql("foo")
    })

    it("should not override a trigger's specified namespace with a default namespace", () => {
      const environmentConfigs: EnvironmentConfig[] = [
        {
          name: "test",
          namespacing: "optional",
          defaultNamespace: "foo",
          variables: {},
        },
      ]

      const configToPopulate = { ...config, triggers: [{ ...trigger, namespace: "bar" }] }
      populateNamespaceForTriggers(configToPopulate, environmentConfigs)
      expect(configToPopulate.triggers![0].namespace).to.eql("bar")
    })
  })
})
