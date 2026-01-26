/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginBuildActionParamsBase } from "../../base.js"
import { actionParamsSchema } from "../../base.js"
import { dedent } from "../../../util/string.js"
import { createSchema, joi } from "../../../config/common.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { BuildAction } from "../../../actions/build.js"
import type { ActionState, Resolved } from "../../../actions/types.js"
import { actionStates } from "../../../actions/types.js"
import { joiVariables } from "../../../config/common.js"

type PlanBuildParams<T extends BuildAction> = PluginBuildActionParamsBase<T>

export interface PlanBuildResult {
  state: ActionState
  outputs: Record<string, any>
  planDescription: string
}

export const getPlanBuildSchema = createSchema({
  name: "plan-build",
  keys: () => ({
    state: joi
      .string()
      .allow(...actionStates)
      .only()
      .required()
      .description("The state of the action."),
    outputs: joiVariables().description("Runtime outputs that the build would produce"),
    planDescription: joi.string().required().description("Human-readable description of what the build would do"),
  }),
})

export class PlanBuild<T extends BuildAction = BuildAction> extends ActionTypeHandlerSpec<
  "Build",
  PlanBuildParams<Resolved<T>>,
  PlanBuildResult
> {
  description = dedent`
    Generate a plan showing what would be executed by this Build action, without actually building.

    Called by the \`garden deploy --dry-run\` command when this Build is a dependency.

    This handler should return a description of what the build would do, as well as the runtime outputs
    that would be produced.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getPlanBuildSchema()
}
