/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { variableNameRegex, joiPrimitive, joiArray, joiVariables, joiIdentifierMap } from "../common.js"
import { joi } from "../common.js"
import type { DefaultEnvironmentContextParams } from "./project.js"
import { DefaultEnvironmentContext } from "./project.js"
import { schema } from "./base.js"
import type { VariablesContext } from "./variables.js"

interface ArgsSchema {
  [name: string]: string | number | string[]
}

interface OptsSchema {
  [name: string]: string | boolean | number
}

/**
 * This context is available for template strings in `variables`, `exec` and `gardenCommand` fields in custom Commands.
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

  constructor(
    params: DefaultEnvironmentContextParams & {
      args: ArgsSchema
      opts: OptsSchema
      variables: VariablesContext
      rest: string[]
    }
  ) {
    super(params)
    this.args = { "$all": [], "$rest": params.rest, "--": [], ...params.args }
    this.opts = params.opts
    this.var = this.variables = params.variables
  }
}
