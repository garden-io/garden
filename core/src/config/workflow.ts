/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize, omit } from "lodash-es"
import type { PrimitiveMap } from "./common.js"
import {
  joi,
  joiUserIdentifier,
  joiVariableName,
  joiIdentifier,
  joiEnvVars,
  joiSparseArray,
  createSchema,
  unusedApiVersionSchema,
} from "./common.js"
import { deline, dedent } from "../util/string.js"
import type { ServiceLimitSpec } from "../plugins/container/moduleConfig.js"
import type { Garden } from "../garden.js"
import { WorkflowConfigContext } from "./template-contexts/workflow.js"
import { validateConfig } from "./validation.js"
import { ConfigurationError, GardenError } from "../exceptions.js"
import type { EnvironmentConfig } from "./project.js"
import { getNamespace } from "./project.js"
import { omitUndefined } from "../util/objects.js"
import type { BaseGardenResource, GardenResource } from "./base.js"
import type { GardenApiVersion } from "../constants.js"
import { DOCS_BASE_URL } from "../constants.js"
import { deepEvaluate } from "../template/evaluate.js"

export const minimumWorkflowRequests = {
  cpu: 50, // 50 millicpu
  memory: 64, // 64MB
}

export const defaultWorkflowRequests = minimumWorkflowRequests

export const minimumWorkflowLimits = {
  cpu: 100, // 100 millicpu
  memory: 64, // 64MB
}

export const defaultWorkflowLimits = {
  cpu: 1000, // = 1000 millicpu = 1 CPU
  memory: 1024, // = 1024MB = 1GB
}

export const defaultWorkflowResources = {
  requests: defaultWorkflowRequests,
  limits: defaultWorkflowLimits,
}

export interface WorkflowConfig extends BaseGardenResource {
  apiVersion: GardenApiVersion
  description?: string
  envVars: PrimitiveMap
  kind: "Workflow"
  resources: {
    requests: ServiceLimitSpec
    limits: ServiceLimitSpec
  }
  keepAliveHours?: number
  files?: WorkflowFileSpec[]
  limits?: ServiceLimitSpec
  steps: WorkflowStepSpec[]
  triggers?: TriggerSpec[]
}

export interface WorkflowRunConfig extends Omit<WorkflowConfig, "triggers"> {
  environment: string // The environment the workflow run is executed in
  namespace: string // The namespace the workflow run is executed in
}

export function makeRunConfig(
  workflowConfig: WorkflowConfig,
  environment: string,
  namespace: string
): WorkflowRunConfig {
  return { ...omit(workflowConfig, ["triggers"]), environment, namespace }
}

export type WorkflowResource = WorkflowConfig

const workflowResourceRequestsSchema = createSchema({
  name: "workflow-resource-request",
  keys: () => ({
    cpu: joi.number().min(minimumWorkflowRequests.cpu).description(deline`
        The minimum amount of CPU the workflow needs in order to be scheduled, in millicpus (i.e. 1000 = 1 CPU).
      `),
    memory: joi.number().min(minimumWorkflowRequests.memory).description(deline`
        The minimum amount of RAM the workflow needs in order to be scheduled, in megabytes (i.e. 1024 = 1 GB).
      `),
  }),
})

const workflowResourceLimitsSchema = createSchema({
  name: "workflow-resource-limit",
  keys: () => ({
    cpu: joi
      .number()
      .min(minimumWorkflowLimits.cpu)
      .description("The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU)."),
    memory: joi
      .number()
      .min(minimumWorkflowLimits.memory)
      .description("The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB)."),
  }),
})

export const workflowConfigSchema = createSchema({
  name: "workflow-config",
  description: "Configure a workflow for this project.",
  keys: () => ({
    apiVersion: unusedApiVersionSchema(),
    kind: joi.string().default("Workflow").valid("Workflow"),
    name: joiUserIdentifier().required().description("The name of this workflow.").example("my-workflow"),
    description: joi.string().description("A description of the workflow."),
    envVars: joiEnvVars().description(
      "A map of environment variables to use for the workflow. These will be available to all steps in the workflow."
    ),
    files: joiSparseArray(workflowFileSchema()).description(dedent`
        A list of files to write before starting the workflow.

        This is useful to e.g. create files required for provider authentication, and can be created from data stored in secrets or templated strings.

        Note that you cannot reference provider configuration in template strings within this field, since they are resolved after these files are generated. This means you can reference the files specified here in your provider configurations.
        `),
    keepAliveHours: joi
      .number()
      .default(48)
      .description("The number of hours to keep the workflow pod running after completion."),
    resources: joi
      .object()
      .keys({
        requests: workflowResourceRequestsSchema().default(defaultWorkflowRequests),
        limits: workflowResourceLimitsSchema().default(defaultWorkflowLimits),
      })
      // .default(() => ({}))
      .meta({ enterprise: true }),
    limits: workflowResourceLimitsSchema().meta({
      enterprise: true,
      deprecated: "Please use the `resources.limits` field instead.",
    }),
    steps: joiSparseArray(workflowStepSchema()).required().min(1).description(deline`
        The steps the workflow should run. At least one step is required. Steps are run sequentially.
        If a step fails, subsequent steps are skipped.
      `),
    triggers: joi
      .array()
      .items(triggerSchema())
      .description(
        `A list of triggers that determine when the workflow should be run, and which environment should be used (Garden Cloud only).`
      )
      .meta({ enterprise: true }),
  }),
  allowUnknown: true,
})

export interface WorkflowFileSpec {
  path: string
  data?: string
  secretName?: string
}

export const workflowFileSchema = createSchema({
  name: "workflow-file",
  description:
    "A file to create ahead of running the workflow, within the project root. Must specify one of `data` or `secretName` (but not both).",
  keys: () => ({
    path: joi
      .posixPath()
      .relativeOnly()
      .subPathOnly()
      .description(
        dedent`
        POSIX-style path to write the file to, relative to the project root (or absolute). If the path contains one
        or more directories, they are created automatically if necessary.
        If any of those directories conflict with existing file paths, or if the file path conflicts with an existing directory path, an error will be thrown.
        **Any existing file with the same path will be overwritten, so be careful not to accidentally overwrite files unrelated to your workflow.**
        `
      )
      .example(".auth/kubeconfig.yaml"),
    data: joi.string().description("The file data as a string."),
    secretName: joiVariableName()
      .description("The name of a Garden secret to copy the file data from (Garden Cloud only).")
      .meta({ enterprise: true }),
  }),
  xor: [["data", "secretName"]],
})

export interface WorkflowStepSpec {
  name?: string
  command?: string[]
  description?: string
  envVars?: PrimitiveMap
  script?: string
  when?: workflowStepModifier
  skip?: boolean
  continueOnError?: boolean
}

export const workflowStepSchema = createSchema({
  name: "workflow-step",
  description: "A workflow step. Must specify either `command` or `script` (but not both).",
  keys: () => ({
    name: joiIdentifier().description(dedent`
      An identifier to assign to this step. If none is specified, this defaults to "step-<number of step>", where
      <number of step> is the sequential number of the step (first step being number 1).

      This identifier is useful when referencing command outputs in following steps. For example, if you set this
      to "my-step", following steps can reference the \${steps.my-step.outputs.*} key in the \`script\` or \`command\`
      fields.
    `),
    command: joi
      .sparseArray()
      .items(joi.string())
      .description(
        dedent`
        A Garden command this step should run, followed by any required or optional arguments and flags.

        Note that commands that are _persistent_—e.g. the dev command, commands with a watch flag set, the logs command with following enabled etc.—are not supported. In general, workflow steps should run to completion.

        Global options like --env, --log-level etc. are currently not supported for built-in commands, since they are handled before the individual steps are run.
        `
      )
      .example(["run", "my-task"]),
    description: joi.string().description("A description of the workflow step."),
    envVars: joiEnvVars().description(dedent`
      A map of environment variables to use when running script steps. Ignored for \`command\` steps.

      Note: Environment variables provided here take precedence over any environment variables configured at the
      workflow level.
    `),
    script: joi.string().description(
      dedent`
      A bash script to run. Note that the host running the workflow must have bash installed and on path.
      It is considered to have run successfully if it returns an exit code of 0. Any other exit code signals an error,
      and the remainder of the workflow is aborted.

      The script may include template strings, including references to previous steps.
      `
    ),
    skip: joi
      .boolean()
      .default(false)
      .description(
        `Set to true to skip this step. Use this with template conditionals to skip steps for certain environments or scenarios.`
      )
      .example("${environment.name != 'prod'}"),
    when: joi.string().allow("onSuccess", "onError", "always", "never").default("onSuccess").description(dedent`
      If used, this step will be run under the following conditions (may use template strings):

      \`onSuccess\` (default): This step will be run if all preceding steps succeeded or were skipped.

      \`onError\`: This step will be run if a preceding step failed, or if its preceding step has \`when: onError\`.
      If the next step has \`when: onError\`, it will also be run. Otherwise, all subsequent steps are ignored.

      \`always\`: This step will always be run, regardless of whether any preceding steps have failed.

      \`never\`: This step will always be ignored.

      See the [workflows guide](${DOCS_BASE_URL}/features/workflows#the-skip-and-when-options) for details
      and examples.
      `),
    continueOnError: joi.boolean().description(`Set to true to continue if the step errors.`).default(false),
  }),
  xor: [["command", "script"]],
})

export type workflowStepModifier = "onSuccess" | "onError" | "always" | "never"

export const triggerEvents = [
  "push",
  "pull-request",
  "pull-request-opened",
  "pull-request-reopened",
  "pull-request-updated",
  "pull-request-closed",
  "pull-request-merged",
]

export interface TriggerSpec {
  environment: string
  namespace?: string
  events?: string[]
  branches?: string[]
  baseBranches?: string[]
  ignoreBranches?: string[]
  ignoreBaseBranches?: string[]
}

export const triggerSchema = memoize(() => {
  const eventDescriptions = triggerEvents
    .sort()
    .map((event) => `\`${event}\``)
    .join(", ")

  return joi.object().keys({
    environment: joi.string().required().description(deline`
        The environment name (from your project configuration) to use for the workflow when matched by this trigger.
      `),
    namespace: joi.string().description(deline`
        The namespace to use for the workflow when matched by this trigger. Follows the namespacing setting used for
        this trigger's environment, as defined in your project's environment configs.
      `),
    events: joi
      .array()
      .items(joi.string().valid(...triggerEvents))
      .unique()
      .description(
        dedent`
        A list of [GitHub events](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads) that should trigger this workflow.

        See the Garden Cloud documentation on [configuring workflows](https://cloud.docs.garden.io/getting-started/workflows) for more details.

        Supported events:

        ${eventDescriptions}
        \n
        `
      ),
    branches: joi.sparseArray().items(joi.string()).unique().description(deline`
        If specified, only run the workflow for branches matching one of these filters. These filters refer to the
        pull/merge request's head branch (e.g. \`my-feature-branch\`), not the base branch that the pull/merge request
        would be merged into if approved (e.g. \`main\`).
       `),
    baseBranches: joi.sparseArray().items(joi.string()).unique().description(deline`
        If specified, only run the workflow for pull/merge requests whose base branch matches one of these filters.
      `),
    ignoreBranches: joi.sparseArray().items(joi.string()).unique().description(deline`
        If specified, do not run the workflow for branches matching one of these filters. These filters refer to the
        pull/merge request's head branch (e.g. \`my-feature-branch\`), not the base branch that the pull/merge request
        would be merged into if approved (e.g. \`main\`).
      `),
    ignoreBaseBranches: joi.sparseArray().items(joi.string()).unique().description(deline`
        If specified, do not run the workflow for pull/merge requests whose base branch matches one of these filters.
      `),
  })
})

export interface WorkflowConfigMap {
  [key: string]: WorkflowConfig
}

export function resolveWorkflowConfig(garden: Garden, config: WorkflowConfig) {
  const log = garden.log
  const context = new WorkflowConfigContext(garden, garden.variables)

  log.silly(() => `Resolving template strings for workflow ${config.name}`)

  const partialConfig = {
    // Don't allow templating in names and triggers
    ...omit(config, "name", "triggers"),
    // Defer resolution of step commands and scripts (the dummy script will be overwritten again below)
    steps: config.steps.map((s) => ({ ...s, command: undefined, script: "echo" })),
  }

  let resolvedPartialConfig: WorkflowConfig = {
    // @ts-expect-error todo: correct types for unresolved configs
    ...deepEvaluate(partialConfig, {
      context,
      opts: {},
    }),
    internal: config.internal,
    name: config.name,
  }

  if (config.triggers) {
    resolvedPartialConfig.triggers = config.triggers
  }

  log.silly(() => `Validating config for workflow ${config.name}`)

  resolvedPartialConfig = validateConfig({
    config: resolvedPartialConfig,
    schema: workflowConfigSchema(),
    projectRoot: garden.projectRoot,
    yamlDocBasePath: [],
  })

  // Re-add the deferred step commands and scripts
  const resolvedConfig = {
    ...resolvedPartialConfig,
    steps: resolvedPartialConfig.steps.map((s, i) =>
      omitUndefined({
        ...omit(s, "command", "script"),
        command: config.steps[i].command,
        script: config.steps[i].script,
      })
    ),
  }

  /**
   * TODO: Remove support for workflow.limits the next time we make a release with breaking changes.
   *
   * workflow.limits is deprecated, so we copy its values into workflow.resources.limits if workflow.limits
   * is specified.
   */

  if (resolvedConfig.limits) {
    resolvedConfig.resources.limits = resolvedConfig.limits
  }

  const environmentConfigs = garden.getProjectConfig().environments

  validateTriggers(resolvedConfig, environmentConfigs)
  populateNamespaceForTriggers(resolvedConfig, environmentConfigs)

  return resolvedConfig
}

/**
 * Throws if one or more triggers uses an environment that isn't defined in the project's config.
 */
function validateTriggers(config: WorkflowConfig, environmentConfigs: EnvironmentConfig[]) {
  const invalidTriggers: TriggerSpec[] = []
  const environmentNames = environmentConfigs.map((c) => c.name)
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

    throw new ConfigurationError({ message: msg })
  }
}

export function populateNamespaceForTriggers(config: WorkflowConfig, environmentConfigs: EnvironmentConfig[]) {
  try {
    for (const trigger of config.triggers || []) {
      const environmentConfigForTrigger = environmentConfigs.find((c) => c.name === trigger.environment)
      trigger.namespace = getNamespace(environmentConfigForTrigger!, trigger.namespace)
    }
  } catch (err) {
    if (!(err instanceof GardenError)) {
      throw err
    }

    throw new ConfigurationError({
      message: `Invalid namespace in trigger for workflow ${config.name}: ${err.message}`,
      wrappedErrors: [err],
    })
  }
}

export function isWorkflowConfig(resource: GardenResource): resource is WorkflowConfig {
  return resource.kind === "Workflow"
}
