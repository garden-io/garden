/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { TestGarden } from "../../../helpers.js"
import { expectError, getDataDir, makeTestGarden, makeTestGardenA } from "../../../helpers.js"
import type { WorkflowConfig, WorkflowStepSpec, TriggerSpec } from "../../../../src/config/workflow.js"
import {
  resolveWorkflowConfig,
  populateNamespaceForTriggers,
  minimumWorkflowLimits,
  defaultWorkflowRequests,
  defaultWorkflowLimits,
  defaultWorkflowResources,
} from "../../../../src/config/workflow.js"
import type { EnvironmentConfig } from "../../../../src/config/project.js"
import { defaultNamespace } from "../../../../src/config/project.js"
import { join } from "path"
import { GardenApiVersion } from "../../../../src/constants.js"
import { omit } from "lodash-es"
import { parseTemplateCollection } from "../../../../src/template/templated-collections.js"
import { serialiseUnresolvedTemplates } from "../../../../src/template/types.js"
import { VariablesContext } from "../../../../src/config/template-contexts/variables.js"

describe("resolveWorkflowConfig", () => {
  let garden: TestGarden

  const defaults = {
    files: [],
    internal: {
      basePath: "/tmp/foo",
    },
    resources: {
      requests: defaultWorkflowRequests,
      limits: defaultWorkflowLimits,
    },
    keepAliveHours: 48,
  }

  const defaultWorkflowStep: WorkflowStepSpec = {
    skip: false,
    when: "onSuccess",
    continueOnError: false,
  }

  before(async () => {
    garden = await makeTestGardenA()
    garden.secrets = { foo: "bar", bar: "baz", baz: "banana" }
    garden.variables = VariablesContext.forTest({ garden, variablePrecedence: [{ foo: "baz", skip: false }] })
  })

  it("should pass through a canonical workflow config", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: GardenApiVersion.v0,
      kind: "Workflow",
      name: "workflow-a",

      description: "Sample workflow",
      envVars: {},
      steps: [
        {
          ...defaultWorkflowStep,
          description: "Deploy the stack",
          command: ["deploy"],
          skip: false,
          when: "onSuccess",
          envVars: {},
        },
        { ...defaultWorkflowStep, command: ["test"], skip: false, when: "onSuccess", envVars: {} },
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
      apiVersion: GardenApiVersion.v0,
      kind: "Workflow",
      name: "workflow-a",

      description: "Sample workflow",
      envVars: {},
      limits: minimumWorkflowLimits, // <----
      steps: [
        {
          ...defaultWorkflowStep,
          description: "Deploy the stack",
          command: ["deploy"],
          skip: false,
          when: "onSuccess",
          envVars: {},
        },
        { ...defaultWorkflowStep, command: ["test"], skip: false, when: "onSuccess", envVars: {} },
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
    const config: WorkflowConfig = parseTemplateCollection({
      value: {
        ...defaults,
        apiVersion: GardenApiVersion.v0,
        kind: "Workflow" as const,
        name: "workflow-a",

        description: "Secret: ${secrets.foo}, var: ${variables.foo}" as string,
        envVars: {},
        steps: [
          {
            description: "Deploy the stack",
            command: ["deploy"],
            skip: "${var.skip}" as unknown as boolean,
            when: "onSuccess",
            envVars: {},
          },
        ],
      } as const,
      source: { path: [] },
    })

    const resolved = resolveWorkflowConfig(garden, config)

    expect(resolved.description).to.equal("Secret: bar, var: baz")
    expect(resolved.steps[0].skip).to.equal(false)
  })

  it("should not resolve template strings in step commands and scripts", async () => {
    const config: WorkflowConfig = parseTemplateCollection({
      value: {
        ...defaults,
        apiVersion: GardenApiVersion.v0,
        kind: "Workflow" as const,
        name: "workflow-a",

        description: "foo",
        envVars: {},
        steps: [
          {
            ...defaultWorkflowStep,
            description: "Deploy the stack",
            command: ["deploy", "${var.foo}" as string],
            skip: false,
            when: "onSuccess",
          },
          { ...defaultWorkflowStep, script: "echo ${var.foo}" as string, skip: false, when: "onSuccess" },
        ],
      } as const,
      source: { path: [] },
    })

    const resolved = resolveWorkflowConfig(garden, config)

    expect(resolved.steps[0].command).to.eql(config.steps[0].command)
    expect(resolved.steps[1].script).to.eql(config.steps[1].script)
  })

  it("should not resolve template strings in trigger specs or in the workflow name", async () => {
    const configWithTemplateStringInName: WorkflowConfig = {
      ...defaults,
      apiVersion: GardenApiVersion.v0,
      kind: "Workflow",
      name: "workflow-${secrets.foo}", // <--- should not be resolved, resulting in an error

      envVars: {},
      steps: [
        {
          ...defaultWorkflowStep,
          description: "Deploy the stack",
          command: ["deploy"],
          skip: false,
          when: "onSuccess",
        },
        { ...defaultWorkflowStep, command: ["test"], skip: false, when: "onSuccess" },
      ],
    }

    await expectError(() => resolveWorkflowConfig(garden, configWithTemplateStringInName), {
      contains: 'name with value "workflow-${secrets.foo}" fails to match the required pattern',
    })

    const configWithTemplateStringInTrigger: WorkflowConfig = {
      ...defaults,
      apiVersion: GardenApiVersion.v0,
      kind: "Workflow",
      name: "workflow-a",

      envVars: {},
      steps: [
        {
          ...defaultWorkflowStep,
          description: "Deploy the stack",
          command: ["deploy"],
          skip: false,
          when: "onSuccess",
        },
        { ...defaultWorkflowStep, command: ["test"], skip: false, when: "onSuccess" },
      ],
      triggers: [
        {
          environment: "${secrets.bar}", // <--- should not be resolved, resulting in an error
        },
      ],
    }

    return expectError(() => resolveWorkflowConfig(garden, configWithTemplateStringInTrigger), {
      contains: "Invalid environment in trigger for workflow",
    })
  })

  it("should populate default values in the schema", async () => {
    const config: WorkflowConfig = {
      apiVersion: GardenApiVersion.v0,
      kind: "Workflow",
      name: "workflow-a",

      internal: {
        basePath: "/tmp",
      },

      description: "Description",
      envVars: {},
      resources: defaultWorkflowResources,
      steps: [{ description: "Deploy the stack", command: ["deploy"] }, { command: ["test"] }],
    }

    expect(resolveWorkflowConfig(garden, config)).to.eql({
      ...defaults,
      ...config,
      steps: [
        { ...defaultWorkflowStep, description: "Deploy the stack", command: ["deploy"], envVars: {} },
        { ...defaultWorkflowStep, command: ["test"], envVars: {} },
      ],
    })
  })

  it("should throw if a trigger uses an environment that isn't defined in the project", async () => {
    const config: WorkflowConfig = {
      ...defaults,
      apiVersion: GardenApiVersion.v0,
      kind: "Workflow",
      name: "workflow-a",

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

    await expectError(() => resolveWorkflowConfig(garden, config), {
      contains: "Invalid environment in trigger for workflow workflow-a",
    })
  })

  it("should resolve a workflow from a template", async () => {
    const _garden = await makeTestGarden(getDataDir("test-projects", "config-templates"))

    const workflow = await _garden.getWorkflowConfig("foo-test")

    const internal = {
      basePath: _garden.projectRoot,
      configFilePath: join(_garden.projectRoot, "workflows.garden.yml"),
      parentName: "foo",
      templateName: "workflows",
      inputs: {
        name: "test",
        envName: "${environment.name}", // unresolved
      },
    }

    expect(workflow).to.exist
    expect(serialiseUnresolvedTemplates(workflow.steps[0].script)).to.equal('echo "${inputs.envName}"') // unresolved
    expect(serialiseUnresolvedTemplates(omit(workflow.internal, "yamlDoc"))).to.eql(internal)
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
      apiVersion: GardenApiVersion.v0,
      kind: "Workflow",
      name: "workflow-a",

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

      void expectError(() => populateNamespaceForTriggers({ ...config, triggers: [trigger] }, environmentConfigs), {
        contains: `Invalid namespace in trigger for workflow workflow-a: Environment test has defaultNamespace set to null in the project configuration, and no explicit namespace was specified. Please either set a defaultNamespace or explicitly set a namespace at runtime (e.g. --env=some-namespace.test).`,
      })
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
