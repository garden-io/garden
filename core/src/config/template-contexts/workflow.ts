/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiIdentifierMap, DeepPrimitiveMap, joiVariables } from "../common"
import { Garden } from "../../garden"
import { joi } from "../common"
import { dedent } from "../../util/string"
import { RemoteSourceConfigContext } from "./project"
import { schema, ConfigContext, ErrorContext } from "./base"

/**
 * This context is available for template strings in all workflow config fields except `name` and `triggers[]`.
 */
export class WorkflowConfigContext extends RemoteSourceConfigContext {}

class WorkflowStepContext extends ConfigContext {
  @schema(joi.string().description("The full output log from the step."))
  public log: string

  @schema(
    joiVariables()
      // TODO: populate and then link to command docs
      .description(
        dedent`
        The outputs returned by the step, as a mapping. Script steps will always have \`stdout\` and \`stderr\` keys.
        Command steps return different keys, including potentially nested maps and arrays. Please refer to each command
        for its output schema.
        `
      )
      .example({ stdout: "my script output" })
      .meta({ keyPlaceholder: "<output-key>" })
  )
  public outputs: DeepPrimitiveMap

  constructor(root: ConfigContext, stepResult: WorkflowStepResult) {
    super(root)
    this.log = stepResult.log
    this.outputs = stepResult.outputs
  }
}

export interface WorkflowStepResult {
  number: number
  outputs: DeepPrimitiveMap
  log: string
}

export class WorkflowStepConfigContext extends WorkflowConfigContext {
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
  public steps: Map<string, WorkflowStepContext | ErrorContext>

  constructor({
    allStepNames,
    garden,
    resolvedSteps,
    stepName,
  }: {
    allStepNames: string[]
    garden: Garden
    resolvedSteps: { [name: string]: WorkflowStepResult }
    stepName: string
  }) {
    super(garden)

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
      this.steps.set(name, new WorkflowStepContext(this, result))
    }
  }
}
