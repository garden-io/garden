/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deline } from "../../../util/string.js"
import type { PluginActionParamsBase } from "../../base.js"
import { actionParamsSchema } from "../../base.js"
import type { DeepPrimitiveMap } from "../../../config/common.js"
import { joi, joiVariables } from "../../../config/common.js"
import { templateStringLiteral } from "../../../docs/common.js"
import type { BaseAction } from "../../../actions/base.js"
import type { Resolved } from "../../../actions/types.js"
import { ActionTypeHandlerSpec } from "./base.js"

export interface GetActionOutputsParams<T extends BaseAction> extends PluginActionParamsBase {
  action: Resolved<T>
}

export interface GetActionOutputsResult {
  outputs: DeepPrimitiveMap
}

export const actionOutputsSchema = () =>
  joiVariables().description("The static outputs defined by the action (referenceable in other action configs).")

export class GetActionOutputs<T extends BaseAction = BaseAction> extends ActionTypeHandlerSpec<
  any,
  GetActionOutputsParams<T>,
  GetActionOutputsResult
> {
  description = deline`
    Resolve any statically resolvable outputs for the action, that don't require the action to be executed. These are made available via
    ${templateStringLiteral("actions.<kind>.<name>.outputs.*")} template strings.
  `

  paramsSchema = () => actionParamsSchema()

  resultSchema = () =>
    joi.object().keys({
      outputs: actionOutputsSchema(),
    })
}
