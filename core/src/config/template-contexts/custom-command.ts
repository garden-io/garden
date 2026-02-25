/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash-es"
import type { PrimitiveMap } from "../common.js"
import { variableNameRegex, joiPrimitive, joiArray, joiVariables, joiIdentifierMap } from "../common.js"
import { joi } from "../common.js"
import { dedent } from "../../util/string.js"
import type { DefaultEnvironmentContextParams } from "./project.js"
import { DefaultEnvironmentContext } from "./project.js"
import { schema, ErrorContext, EnvironmentContext } from "./base.js"
import type { VariablesContext } from "./variables.js"
import type { ProviderMap } from "../provider.js"
import { ProviderContext } from "./provider.js"
import type { GardenModule } from "../../types/module.js"
import type { ExecutedAction, ResolvedAction } from "../../actions/types.js"
import { ModuleReferenceContext, RuntimeConfigContext } from "./module.js"
import { ActionReferencesContext } from "./actions.js"
import type { GraphResults } from "../../graph/results.js"
import type { Log } from "../../logger/log-entry.js"
import { WorkflowStepContext, type WorkflowStepResult } from "./workflow.js"

interface ArgsSchema {
  [name: string]: string | number | string[]
}

interface OptsSchema {
  [name: string]: string | boolean | number
}

export interface CustomCommandContextParams extends DefaultEnvironmentContextParams {
  args: ArgsSchema
  opts: OptsSchema
  variables: VariablesContext
  rest: string[]
  // Optional expanded fields, populated via lazy resolution when template references require them
  environment?: EnvironmentContext
  secrets?: PrimitiveMap
  resolvedProviders?: ProviderMap
  modules?: GardenModule[]
  executedActions?: (ResolvedAction | ExecutedAction)[]
  graphResults?: GraphResults
  log?: Log
}

/**
 * This context is available for template strings in `variables`, `exec`, `gardenCommand`, and `steps` fields
 * in custom Commands.
 *
 * When a command's template strings reference providers, actions, modules, or runtime outputs, a richer
 * context is lazily populated via the `resolvedProviders`, `modules`, and `graphResults` parameters.
 */
export class CustomCommandContext extends DefaultEnvironmentContext {
  @schema(
    joiVariables()
      .description("A map of all variables defined in the command configuration.")
      .meta({ keyPlaceholder: "<variable-name>" })
  )
  public readonly variables: VariablesContext

  @schema(joiIdentifierMap(joiPrimitive()).description("Alias for the variables field."))
  public readonly var: VariablesContext

  @schema(
    joi
      .object()
      .keys({
        "$all": joiArray(joi.string()).description(
          "Every argument passed to the command, except the name of the command itself."
        ),
        "$rest": joiArray(joi.string()).description(
          "Every positional argument and option that isn't explicitly defined in the custom command, including any global Garden flags."
        ),
        "--": joiArray(joi.string()).description("Every argument following -- on the command line."),
      })
      .pattern(variableNameRegex, joiPrimitive())
      .default(() => ({}))
      .unknown(true)
      .description(
        "Map of all arguments, as defined in the Command spec. Also includes `$all`, `$rest` and `--` fields. See their description for details."
      )
  )
  public readonly args: ArgsSchema

  @schema(
    joi
      .object()
      .pattern(variableNameRegex, joiPrimitive())
      .default(() => ({}))
      .unknown(true)
      .description("Map of all options, as defined in the Command spec.")
  )
  public readonly opts: OptsSchema

  // Expanded context fields (populated when lazy resolution determines they're needed)

  @schema(
    EnvironmentContext.getSchema().description(
      "Information about the environment that Garden is running against. Only available when the command references environment-specific data."
    )
  )
  public readonly environment?: EnvironmentContext

  @schema(
    joi
      .object()
      .pattern(/.+/, joi.string())
      .description("A map of all secrets for this project in the current environment.")
      .meta({ keyPlaceholder: "<secret-name>" })
  )
  public readonly secrets?: PrimitiveMap

  @schema(
    joiIdentifierMap(ProviderContext.getSchema())
      .description("Retrieve information about providers that are defined in the project.")
      .meta({ keyPlaceholder: "<provider-name>" })
  )
  public readonly providers?: Map<string, ProviderContext>

  @schema(
    ActionReferencesContext.getSchema().description(
      "Runtime outputs and information from other actions (only resolved at runtime when executing actions)."
    )
  )
  public readonly actions?: ActionReferencesContext

  @schema(
    joiIdentifierMap(ModuleReferenceContext.getSchema())
      .description("Retrieve information about modules that are defined in the project.")
      .meta({ keyPlaceholder: "<module-name>" })
  )
  public readonly modules?: Map<string, ModuleReferenceContext>

  @schema(
    RuntimeConfigContext.getSchema().description(
      "Runtime outputs and information from services and tasks " +
        "(only resolved at runtime when deploying services and running tasks)."
    )
  )
  public readonly runtime?: RuntimeConfigContext

  constructor(params: CustomCommandContextParams) {
    super(params)
    this.args = { "$all": [], "$rest": params.rest, "--": [], ...params.args }
    this.opts = params.opts
    this.var = this.variables = params.variables

    // Optional expanded fields
    if (params.environment) {
      this.environment = params.environment
    }
    if (params.secrets) {
      this.secrets = params.secrets
    }
    if (params.resolvedProviders) {
      this.providers = new Map(Object.entries(mapValues(params.resolvedProviders, (p) => new ProviderContext(p))))
    }
    if (params.executedActions && params.log) {
      this.actions = new ActionReferencesContext(params.log, params.executedActions)
    }
    if (params.modules) {
      this.modules = new Map(params.modules.map((m) => [m.name, new ModuleReferenceContext(m)]))
    }
    if (params.graphResults || params.log) {
      this.runtime = new RuntimeConfigContext(params.log!, params.graphResults)
    }
  }
}

/**
 * This context extends CustomCommandContext with `steps.*` references, available in step-level
 * template strings. It allows referencing outputs from previous steps.
 */
export class CustomCommandStepContext extends CustomCommandContext {
  @schema(
    joiIdentifierMap(WorkflowStepContext.getSchema())
      .description(
        dedent`
        Reference previous steps in a command. Only available in the \`steps[].gardenCommand\`, \`steps[].exec\`,
        and \`steps[].script\` fields.
        The name of the step should be the explicitly set \`name\` of the other step, or if one is not set, use
        \`step-<n>\`, where <n> is the sequential number of the step (starting from 1).
        `
      )
      .meta({ keyPlaceholder: "<step-name>" })
  )
  public readonly steps: Map<string, WorkflowStepContext | ErrorContext>

  constructor(
    params: CustomCommandContextParams & {
      allStepNames: string[]
      resolvedSteps: { [name: string]: WorkflowStepResult }
      stepName: string
    }
  ) {
    super(params)

    this.steps = new Map<string, WorkflowStepContext | ErrorContext>()

    for (const name of params.allStepNames) {
      this.steps.set(
        name,
        new ErrorContext(
          `Step ${name} is referenced in a template for step ${params.stepName}, but step ${name} is later in the execution order. Only previous steps can be referenced.`
        )
      )
    }

    this.steps.set(
      params.stepName,
      new ErrorContext(
        `Step ${params.stepName} references itself in a template. Only previous steps can be referenced.`
      )
    )

    for (const [name, result] of Object.entries(params.resolvedSteps)) {
      this.steps.set(name, new WorkflowStepContext(result))
    }
  }
}
