/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginRunActionParamsBase } from "../../base.js"
import { actionParamsSchema } from "../../base.js"
import { dedent } from "../../../util/string.js"
import { createSchema, joi } from "../../../config/common.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { RunAction } from "../../../actions/run.js"
import type { ActionState, Resolved } from "../../../actions/types.js"
import { actionStates } from "../../../actions/types.js"
import { joiVariables } from "../../../config/common.js"

type PlanRunParams<T extends RunAction> = PluginRunActionParamsBase<T>

export interface PlanRunResult {
  state: ActionState
  outputs: Record<string, any>
  planDescription: string
}

export const getPlanRunSchema = createSchema({
  name: "plan-run",
  keys: () => ({
    state: joi
      .string()
      .allow(...actionStates)
      .only()
      .required()
      .description("The state of the action."),
    outputs: joiVariables().description("Runtime outputs that the run would produce"),
    planDescription: joi.string().required().description("Human-readable description of what the run would do"),
  }),
})

export class PlanRun<T extends RunAction = RunAction> extends ActionTypeHandlerSpec<
  "Run",
  PlanRunParams<Resolved<T>>,
  PlanRunResult
> {
  description = dedent`
    Generate a plan showing what would be executed by this Run action, without actually running it.

    Called by the \`garden deploy --dry-run\` command when this Run is a dependency.

    This handler should return a description of what the run would do, as well as the runtime outputs
    that would be produced.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getPlanRunSchema()
}
