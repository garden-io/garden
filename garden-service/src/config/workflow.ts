/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { cloneDeep, isEqual, take, pickBy } from "lodash"
import { joi, joiUserIdentifier, joiVariableName, joiIdentifier } from "./common"
import { DEFAULT_API_VERSION } from "../constants"
import { deline, dedent } from "../util/string"
import { defaultContainerLimits, ServiceLimitSpec } from "../plugins/container/config"
import { Garden } from "../garden"
import { WorkflowConfigContext } from "./config-context"
import { resolveTemplateStrings } from "../template-string"
import { validateWithPath } from "./validation"
import { ConfigurationError } from "../exceptions"
import { coreCommands } from "../commands/commands"
import { Parameters } from "../commands/base"

export interface WorkflowConfig {
  apiVersion: string
  description?: string
  name: string
  kind: "Workflow"
  path: string
  configPath?: string
  keepAliveHours?: number
  files?: WorkflowFileSpec[]
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
      files: joi.array().items(workflowFileSchema()).description(dedent`
          A list of files to write before starting the workflow.

          This is useful to e.g. create files required for provider authentication, and can be created from data stored in secrets or templated strings.

          Note that you cannot reference provider configuration in template strings within this field, since they are resolved after these files are generated. This means you can reference the files specified here in your provider configurations.
          `),
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
          `A list of triggers that determine when the workflow should be run, and which environment should be used (Garden Enterprise only).`
        )
        .meta({ enterprise: true }),
    })
    .unknown(true)
    .description("Configure a workflow for this project.")

export interface WorkflowFileSpec {
  path: string
  data?: string
  secretName?: string
}

export const workflowFileSchema = () =>
  joi
    .object()
    .keys({
      path: joi
        .posixPath()
        .relativeOnly()
        .subPathOnly()
        .description(
          dedent`
          POSIX-style path to write the file to, relative to the project root (or absolute). If the path contains one
          or more directories, they are created automatically if necessary.
          If any of those directories conflict with existing file paths, or if the file path conflicts with an existing directory path, an error will be thrown.
          **Any existing file with the same path will be overwritten, so be careful not to accidentally accidentally overwrite files unrelated to your workflow.**
          `
        )
        .example(".auth/kubeconfig.yaml"),
      data: joi.string().description("The file data as a string."),
      secretName: joiVariableName()
        .description("The name of a Garden secret to copy the file data from (Garden Enterprise only).")
        .meta({ enterprise: true }),
    })
    .xor("data", "secretName")
    .description(
      "A file to create ahead of running the workflow, within the project root. Must specify one of `data` or `secretName` (but not both)."
    )

export interface WorkflowStepSpec {
  name?: string
  command?: string[]
  description?: string
  script?: string
}

export const workflowStepSchema = () => {
  const cmdConfigs = getStepCommandConfigs()
  const cmdDescriptions = cmdConfigs
    .map((c) => c.prefix.join(", "))
    .sort()
    .map((prefix) => `\`[${prefix}]\``)
    .join("\n")

  return joi
    .object()
    .keys({
      name: joiIdentifier().description(dedent`
        An identifier to assign to this step. If none is specified, this defaults to "step-<number of step>", where
        <number of step> is the sequential number of the step (first step being number 1).

        This identifier is useful when referencing command outputs in following steps. For example, if you set this
        to "my-step", following steps can reference the \${steps.my-step.outputs.*} key in the \`script\` or \`command\`
        fields.
      `),
      command: joi
        .array()
        .items(joi.string())
        .description(
          dedent`
          A Garden command this step should run, followed by any required or optional arguments and flags.
          Arguments and options for the commands may be templated, including references to previous steps, but for now
          the commands themselves (as listed below) must be hard-coded.

          Supported commands:

          ${cmdDescriptions}
          \n
          `
        )
        .example(["run", "task", "my-task"]),
      description: joi.string().description("A description of the workflow step."),
      script: joi.string().description(
        deline`
        A bash script to run. Note that the host running the workflow must have bash installed and on path.
        It is considered to have run successfully if it returns an exit code of 0. Any other exit code signals an error,
        and the remainder of the workflow is aborted.

        The script may include template strings, including references to previous steps.
        `
      ),
    })
    .xor("command", "script")
    .description("A workflow step. Must specify either `command` or `script` (but not both).")
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
  "release-created",
  "release-edited",
  "release-deleted",
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

export function resolveWorkflowConfig(garden: Garden, config: WorkflowConfig) {
  const log = garden.log
  const context = new WorkflowConfigContext(garden)
  log.silly(`Resolving template strings for workflow ${config.name}`)
  let resolvedConfig = resolveTemplateStrings(cloneDeep(config), context, { allowPartial: true })
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

function filterParameters(params: Parameters) {
  return pickBy(params, (arg) => !arg.cliOnly)
}

/**
 * Get all commands whitelisted for workflows, and allowed args/opts.
 */
export function getStepCommandConfigs() {
  const workflowCommands = coreCommands.flatMap((cmd) => [cmd, ...cmd.getSubCommands()]).filter((cmd) => cmd.workflows)

  return workflowCommands.map((cmd) => ({
    prefix: cmd.getPath(),
    cmdClass: cmd.constructor,
    args: filterParameters(cmd.arguments || {}),
    opts: filterParameters(cmd.options || {}),
  }))
}

/**
 * Throws if one or more steps refers to a command that is not supported in workflows.
 */
function validateSteps(config: WorkflowConfig) {
  const validStepCommandPrefixes = getStepCommandConfigs().map((c) => c.prefix)
  const invalidSteps: WorkflowStepSpec[] = config.steps.filter(
    (step) =>
      !!step.command && !validStepCommandPrefixes.find((valid) => isEqual(valid, take(step.command, valid.length)))
  )

  if (invalidSteps.length > 0) {
    const msgPrefix =
      invalidSteps.length === 1
        ? `Invalid step command for workflow ${config.name}:`
        : `Invalid step commands for workflow ${config.name}:`
    const descriptions = invalidSteps.map((step) => `[${step.command!.join(", ")}]`)
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
