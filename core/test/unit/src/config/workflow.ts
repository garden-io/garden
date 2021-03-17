/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
  minimumWorkflowLimits,
  defaultWorkflowRequests,
  defaultWorkflowLimits,
} from "../../../../src/config/workflow"
import { EnvironmentConfig, defaultNamespace } from "../../../../src/config/project"
import stripAnsi from "strip-ansi"

describe("resolveWorkflowConfig", () => {
  let garden: TestGarden

  const defaults = {
    files: [],
    resources: {
      requests: defaultWorkflowRequests,
      limits: defaultWorkflowLimits,
    },
    keepAliveHours: 48,
  }

  before(async () => {
    garden = await makeTestGardenA()
    garden["secrets"] = { foo: "bar", bar: "baz", baz: "banana" }
    garden["variables"] = { foo: "baz", skip: false }
  })

  it("should pass through a canonical workflow config", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Sample workflow",
      envVars: {},
      steps: [
        { description: "Deploy the stack", command: ["deploy"], skip: false, when: "onSuccess", envVars: {} },
        { command: ["test"], skip: false, when: "onSuccess", envVars: {} },
      ],
      triggers: [
        {
          environment: "local",
          namespace: "default",
          events: ["pull-request"],
          branches: ["feature*"],
          ignoreBranches: ["feature-ignored*"],
        },
      ],
    }

    expect(resolveWorkflowConfig(garden, config)).to.eql({
      ...config,
    })
  })

  it("should set workflow.resources.limits to workflow.limits if workflow.limits is specified", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Sample workflow",
      envVars: {},
      limits: minimumWorkflowLimits, // <----
      steps: [
        { description: "Deploy the stack", command: ["deploy"], skip: false, when: "onSuccess", envVars: {} },
        { command: ["test"], skip: false, when: "onSuccess", envVars: {} },
      ],
      triggers: [
        {
          environment: "local",
          namespace: "default",
          events: ["pull-request"],
          branches: ["feature*"],
          ignoreBranches: ["feature-ignored*"],
        },
      ],
    }

    expect(resolveWorkflowConfig(garden, config)).to.eql({
      ...config,
      resources: {
        requests: defaultWorkflowRequests,
        limits: minimumWorkflowLimits, // <-----
      },
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
      envVars: {},
      steps: [
        {
          description: "Deploy the stack",
          command: ["deploy"],
          skip: ("${var.skip}" as unknown) as boolean,
          when: "onSuccess",
          envVars: {},
        },
      ],
    }

    const resolved = resolveWorkflowConfig(garden, config)

    expect(resolved.description).to.equal("Secret: bar, var: baz")
    expect(resolved.steps[0].skip).to.equal(false)
  })

  it("should not resolve template strings in step commands and scripts", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "foo",
      envVars: {},
      steps: [
        {
          description: "Deploy the stack",
          command: ["deploy", "${var.foo}"],
          skip: false,
          when: "onSuccess",
        },
        { script: "echo ${var.foo}", skip: false, when: "onSuccess" },
      ],
    }

    const resolved = resolveWorkflowConfig(garden, config)

    expect(resolved.steps[0].command).to.eql(config.steps[0].command)
    expect(resolved.steps[1].script).to.eql(config.steps[1].script)
  })

  it("should not resolve template strings in trigger specs or in the workflow name", async () => {
    const configWithTemplateStringInName: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-${secrets.foo}", // <--- should not be resolved, resulting in an error
      path: "/tmp/foo",
      envVars: {},
      steps: [
        { description: "Deploy the stack", command: ["deploy"], skip: false, when: "onSuccess" },
        { command: ["test"], skip: false, when: "onSuccess" },
      ],
    }

    expectError(
      () => resolveWorkflowConfig(garden, configWithTemplateStringInName),
      (err) =>
        expect(stripAnsi(err.message)).to.include(
          'key .name with value "workflow-${secrets.foo}" fails to match the required pattern'
        )
    )

    const configWithTemplateStringInTrigger: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      envVars: {},
      steps: [
        { description: "Deploy the stack", command: ["deploy"], skip: false, when: "onSuccess" },
        { command: ["test"], skip: false, when: "onSuccess" },
      ],
      triggers: [
        {
          environment: "${secrets.bar}", // <--- should not be resolved, resulting in an error
        },
      ],
    }

    expectError(
      () => resolveWorkflowConfig(garden, configWithTemplateStringInTrigger),
      (err) => expect(err.message).to.include("Invalid environment in trigger for workflow")
    )
  })

  it("should populate default values in the schema", async () => {
    const config = <WorkflowConfig>{
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Description",
      envVars: {},
      resources: {},
      steps: [{ description: "Deploy the stack", command: ["deploy"] }, { command: ["test"] }],
    }

    expect(resolveWorkflowConfig(garden, config)).to.eql({
      ...config,
      ...defaults,
      steps: [
        { description: "Deploy the stack", command: ["deploy"], skip: false, when: "onSuccess", envVars: {} },
        { command: ["test"], skip: false, when: "onSuccess", envVars: {} },
      ],
    })
  })

  it("should throw if a step uses an invalid/unsupported command", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Sample workflow",
      envVars: {},
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
        },
      ],
    }

    await expectError(
      () => resolveWorkflowConfig(garden, config),
      (err) => expect(err.message).to.match(/Invalid step command for workflow workflow-a/)
    )
  })

  it("should throw if a step command uses a global option", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Sample workflow",
      envVars: {},
      steps: [{ command: ["test", "--env=foo", "-l", "4"] }, { command: ["test", "--silent"] }],
      triggers: [
        {
          environment: "local",
          events: ["pull-request"],
          branches: ["feature*"],
          ignoreBranches: ["feature-ignored*"],
        },
      ],
    }

    await expectError(
      () => resolveWorkflowConfig(garden, config),
      (err) => expect(err.message).to.match(/Invalid step command options for workflow workflow-a/)
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
      envVars: {},
      steps: [{ description: "Deploy the stack", command: ["deploy"] }, { command: ["test"] }],
      triggers: [
        {
          environment: "banana", // <-------
          events: ["pull-request"],
          branches: ["feature*"],
          ignoreBranches: ["feature-ignored*"],
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
    }
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: DEFAULT_API_VERSION,
      kind: "Workflow",
      name: "workflow-a",
      path: "/tmp/foo",
      description: "Sample workflow",
      envVars: {},
      steps: [{ description: "Deploy the stack", command: ["deploy"] }, { command: ["test"] }],
    }

    it("should pass through a trigger without a namespace when namespacing is optional", () => {
      const environmentConfigs: EnvironmentConfig[] = [
        {
          name: "test",
          defaultNamespace,
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
          defaultNamespace: null,
          variables: {},
        },
      ]

      expectError(
        () => populateNamespaceForTriggers({ ...config, triggers: [trigger] }, environmentConfigs),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            `Invalid namespace in trigger for workflow workflow-a: Environment test has defaultNamespace set to null, and no explicit namespace was specified. Please either set a defaultNamespace or explicitly set a namespace at runtime (e.g. --env=some-namespace.test).`
          )
      )
    })

    it("should populate the trigger with a default namespace if one is defined", () => {
      const environmentConfigs: EnvironmentConfig[] = [
        {
          name: "test",
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
