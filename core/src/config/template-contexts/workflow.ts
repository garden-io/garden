/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeepPrimitiveMap } from "../common.js"
import { joiIdentifierMap, joiVariables } from "../common.js"
import type { Garden } from "../../garden.js"
import { joi } from "../common.js"
import { dedent } from "../../util/string.js"
import { RemoteSourceConfigContext } from "./project.js"
import { TemplatableConfigContext } from "./templatable.js"
import { schema, ContextWithSchema, ErrorContext } from "./base.js"
import type { WorkflowConfig } from "../workflow.js"

/**
 * This context is available for template strings in all workflow config fields except `name` and `triggers[]`.
 */
export class WorkflowConfigContext extends RemoteSourceConfigContext {}

class WorkflowStepContext extends ContextWithSchema {
  @schema(joi.string().description("The full output log from the step."))
  public readonly log: string

  @schema(
    joiVariables()
      // TODO: populate and then link to command docs
      .description(
        dedent`
        The outputs returned by the step, as a mapping. Script steps will always have \`stdout\`, \`stderr\` and \`exitCode\` keys.
        Command steps return different keys, including potentially nested maps and arrays. Please refer to each command
        for its output schema.
        `
      )
      .example({ stdout: "my script output" })
      .meta({ keyPlaceholder: "<output-key>" })
  )
  public readonly outputs: DeepPrimitiveMap

  constructor(stepResult: WorkflowStepResult) {
    super()
    this.log = stepResult.log
    this.outputs = stepResult.outputs
  }
}

export interface WorkflowStepResult {
  number: number
  outputs: DeepPrimitiveMap
  log: string
}

export class WorkflowStepConfigContext extends TemplatableConfigContext {
  @schema(
    joiIdentifierMap(WorkflowStepContext.getSchema())
      .description(
        dedent`
        Reference previous steps in a workflow. Only available in the \`steps[].command\` and \`steps[].script\` fields.
        The name of the step should be the explicitly set \`name\` of the other step, or if one is not set, use
        \`step-<n>\`, where <n> is the sequential number of the step (starting from 1).
        `
      )
      .meta({ keyPlaceholder: "<step-name>" })
  )
  public readonly steps: Map<string, WorkflowStepContext | ErrorContext>

  constructor({
    allStepNames,
    garden,
    resolvedSteps,
    stepName,
    workflow,
  }: {
    allStepNames: string[]
    garden: Garden
    resolvedSteps: { [name: string]: WorkflowStepResult }
    stepName: string
    workflow: WorkflowConfig
  }) {
    super(garden, workflow)

    this.steps = new Map<string, WorkflowStepContext | ErrorContext>()

    for (const name of allStepNames) {
      this.steps.set(
        name,
        new ErrorContext(
          `Step ${name} is referenced in a template for step ${stepName}, but step ${name} is later in the execution order. Only previous steps in the workflow can be referenced.`
        )
      )
    }

    this.steps.set(
      stepName,
      new ErrorContext(
        `Step ${stepName} references itself in a template. Only previous steps in the workflow can be referenced.`
      )
    )

    for (const [name, result] of Object.entries(resolvedSteps)) {
      this.steps.set(name, new WorkflowStepContext(result))
    }
  }
}
