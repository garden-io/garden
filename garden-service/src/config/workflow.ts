/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { cloneDeep, isEqual, take } from "lodash"
import { joi, joiUserIdentifier } from "./common"
import { DEFAULT_API_VERSION } from "../constants"
import { deline, dedent } from "../util/string"
import { defaultContainerLimits, ServiceLimitSpec } from "../plugins/container/config"
import { Garden } from "../garden"
import { Provider } from "./provider"
import { WorkflowConfigContext } from "./config-context"
import { resolveTemplateStrings } from "../template-string"
import { validateWithPath } from "./validation"
import { ConfigurationError } from "../exceptions"

export interface WorkflowConfig {
  apiVersion: string
  description?: string
  name: string
  kind: "Workflow"
  path: string
  configPath?: string
  keepAliveHours?: number
  limits?: ServiceLimitSpec
  steps: WorkflowStepSpec[]
  triggers?: TriggerSpec[]
}

export interface WorkflowResource extends WorkflowConfig {}

export const workflowConfigSchema = () =>
  joi
    .object()
    .keys({
      apiVersion: joi
        .string()
        .default(DEFAULT_API_VERSION)
        .valid(DEFAULT_API_VERSION)
        .description("The schema version of this workflow's config (currently not used)."),
      kind: joi
        .string()
        .default("Workflow")
        .valid("Workflow"),
      name: joiUserIdentifier()
        .required()
        .description("The name of this workflow.")
        .example("my-workflow"),
      description: joi.string().description("A description of the workflow."),
      keepAliveHours: joi
        .number()
        .default(48)
        .description("The number of hours to keep the workflow pod running after completion."),
      limits: joi
        .object({
          cpu: joi
            .number()
            .default(defaultContainerLimits.cpu)
            .min(1000)
            .description("The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU)"),
          memory: joi
            .number()
            .default(defaultContainerLimits.memory)
            .min(1024)
            .description("The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB)"),
        })
        .default(defaultContainerLimits),
      steps: joi
        .array()
        .items(workflowStepSchema())
        .required()
        .min(1).description(deline`
          The steps the workflow should run. At least one step is required. Steps are run sequentially.
          If a step fails, subsequent steps are skipped.
        `),
      triggers: joi
        .array()
        .items(triggerSchema())
        .description(
          deline`
            A list of triggers that determine when the workflow should be run, and which environment should be used.
        `
        )
        .meta({ internal: true }),
    })
    .required()
    .unknown(true)
    .description("Configure a workflow for this project.")
    .meta({ extendable: true })

export interface WorkflowStepSpec {
  command: string[]
  description?: string
}

export const workflowStepSchema = () => {
  const cmdConfigs = getStepCommandConfigs()
  const cmdDescriptions = cmdConfigs
    .map((c) => c.prefix.join(", "))
    .sort()
    .map((prefix) => `\`[${prefix}]\``)
    .join("\n\n")
  return joi.object().keys({
    command: joi
      .array()
      .items(joi.string())
      .required().description(dedent`
        The Garden command this step should run.

        Supported commands:

        ${cmdDescriptions}
      `),
    description: joi.string().description("A description of the workflow step."),
  })
}

export const triggerEvents = [
  "create",
  "push",
  "pull-request",
  "pull-request-created",
  "pull-request-updated",
  "release",
  "release-published",
  "release-unpublished",
  "release-created ",
  "release-edited ",
  "release-deleted ",
  "release-prereleased",
]

export interface TriggerSpec {
  environment: string
  events?: string[]
  branches?: string[]
  tags?: string[]
  ignoreBranches?: string[]
  ignoreTags?: string[]
}

export const triggerSchema = () =>
  joi.object().keys({
    environment: joi.string().required().description(deline`
        The environment name (from your project configuration) to use for the workflow when matched by this trigger.
      `),
    events: joi
      .array()
      .items(joi.string().valid(...triggerEvents))
      .unique()
      .description("A list of GitHub events that should trigger this workflow."),
    branches: joi
      .array()
      .items(joi.string())
      .unique()
      .description("If specified, only run the workflow for branches matching one of these filters."),
    tags: joi
      .array()
      .items(joi.string())
      .unique()
      .description("If specified, only run the workflow for tags matching one of these filters."),
    ignoreBranches: joi
      .array()
      .items(joi.string())
      .unique()
      .description("If specified, do not run the workflow for branches matching one of these filters."),
    ignoreTags: joi
      .array()
      .items(joi.string())
      .unique()
      .description("If specified, do not run the workflow for tags matching one of these filters."),
  })

export interface WorkflowConfigMap {
  [key: string]: WorkflowConfig
}

export function resolveWorkflowConfig(garden: Garden, resolvedProviders: Provider[], config: WorkflowConfig) {
  const log = garden.log
  const { variables, secrets } = garden
  const context = new WorkflowConfigContext(garden, resolvedProviders, variables, secrets)
  log.silly(`Resolving template strings for workflow ${config.name}`)
  let resolvedConfig = resolveTemplateStrings(cloneDeep(config), context)
  log.silly(`Validating config for workflow ${config.name}`)

  resolvedConfig = <WorkflowConfig>validateWithPath({
    config: resolvedConfig,
    configType: "workflow",
    schema: workflowConfigSchema(),
    path: config.path,
    projectRoot: garden.projectRoot,
  })

  validateSteps(resolvedConfig)
  validateTriggers(resolvedConfig, garden.allEnvironmentNames)

  return resolvedConfig
}

// Wrapping this in a function to avoid circular import issues.
export function getStepCommandConfigs() {
  // TODO: This is a bit ad-hoc, we should consider a different setup if we move away from sywac for the CLI.
  const { DeployCommand, deployArgs, deployOpts } = require("../commands/deploy")
  const { DeleteEnvironmentCommand, DeleteServiceCommand, deleteServiceArgs } = require("../commands/delete")
  const { GetOutputsCommand } = require("../commands/get/get-outputs")
  const { TestCommand, testArgs, testOpts } = require("../commands/test")
  const { RunTaskCommand, runTaskArgs, runTaskOpts } = require("../commands/run/task")
  const { PublishCommand, publishArgs, publishOpts } = require("../commands/publish")
  const { RunTestCommand, runTestOpts, runTestArgs } = require("../commands/run/test")
  return [
    { prefix: ["deploy"], cmdClass: DeployCommand, args: deployArgs, opts: deployOpts },
    { prefix: ["delete", "environment"], cmdClass: DeleteEnvironmentCommand, args: {}, opts: {} },
    { prefix: ["delete", "service"], cmdClass: DeleteServiceCommand, args: deleteServiceArgs, opts: {} },
    { prefix: ["get", "outputs"], cmdClass: GetOutputsCommand, args: {}, opts: {} },
    { prefix: ["test"], cmdClass: TestCommand, args: testArgs, opts: testOpts },
    { prefix: ["run", "task"], cmdClass: RunTaskCommand, args: runTaskArgs, opts: runTaskOpts },
    { prefix: ["run", "test"], cmdClass: RunTestCommand, args: runTestArgs, opts: runTestOpts },
    { prefix: ["publish"], cmdClass: PublishCommand, args: publishArgs, opts: publishOpts },
  ]
}

/**
 * Throws if one or more steps refers to a command that is not supported in workflows.
 */
function validateSteps(config: WorkflowConfig) {
  const invalidSteps: WorkflowStepSpec[] = []
  const validStepCommandPrefixes = getStepCommandConfigs().map((c) => c.prefix)
  for (const step of config.steps) {
    const command = step.command
    const validStepPrefix = validStepCommandPrefixes.find((valid) => isEqual(valid, take(command, valid.length)))
    if (!validStepPrefix) {
      invalidSteps.push(step)
    }
  }

  if (invalidSteps.length > 0) {
    const msgPrefix =
      invalidSteps.length === 1
        ? `Invalid step command for workflow ${config.name}:`
        : `Invalid step commands for workflow ${config.name}:`
    const descriptions = invalidSteps.map((step) => `[${step.command.join(", ")}]`)
    const validDescriptions = validStepCommandPrefixes.map((cmd) => `[${cmd.join(", ")}]`)
    const msg = dedent`
      ${msgPrefix}

      ${descriptions.join("\n")}

      Valid step command prefixes:

      ${validDescriptions.join("\n")}
    `
    throw new ConfigurationError(msg, { invalidSteps })
  }
}

/**
 * Throws if one or more triggers uses an environment that isn't defined in the project's config.
 */
function validateTriggers(config: WorkflowConfig, environmentNames: string[]) {
  const invalidTriggers: TriggerSpec[] = []
  for (const trigger of config.triggers || []) {
    if (!environmentNames.includes(trigger.environment)) {
      invalidTriggers.push(trigger)
    }
  }

  if (invalidTriggers.length > 0) {
    const msgPrefix =
      invalidTriggers.length === 1
        ? `Invalid environment in trigger for workflow ${config.name}:`
        : `Invalid environments in triggers for workflow ${config.name}:`

    const msg = dedent`
      ${msgPrefix}

      ${invalidTriggers.map((t) => t.environment).join(", ")}

      Valid environments (defined in your project-level garden.yml):

      ${environmentNames.join(", ")}
    `

    throw new ConfigurationError(msg, { invalidTriggers })
  }
}
