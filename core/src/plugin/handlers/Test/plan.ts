/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginTestActionParamsBase } from "../../base.js"
import { actionParamsSchema } from "../../base.js"
import { dedent } from "../../../util/string.js"
import { createSchema, joi } from "../../../config/common.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { TestAction } from "../../../actions/test.js"
import type { ActionState, Resolved } from "../../../actions/types.js"
import { actionStates } from "../../../actions/types.js"
import { joiVariables } from "../../../config/common.js"

type PlanTestParams<T extends TestAction> = PluginTestActionParamsBase<T>

export interface PlanTestResult {
  state: ActionState
  outputs: Record<string, any>
  planDescription: string
}

export const getPlanTestSchema = createSchema({
  name: "plan-test",
  keys: () => ({
    state: joi
      .string()
      .allow(...actionStates)
      .only()
      .required()
      .description("The state of the action."),
    outputs: joiVariables().description("Runtime outputs that the test would produce"),
    planDescription: joi.string().required().description("Human-readable description of what the test would do"),
  }),
})

export class PlanTest<T extends TestAction = TestAction> extends ActionTypeHandlerSpec<
  "Test",
  PlanTestParams<Resolved<T>>,
  PlanTestResult
> {
  description = dedent`
    Generate a plan showing what would be executed by this Test action, without actually running it.

    Called by the \`garden deploy --dry-run\` command when this Test is a dependency.

    This handler should return a description of what the test would do, as well as the runtime outputs
    that would be produced.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getPlanTestSchema()
}
