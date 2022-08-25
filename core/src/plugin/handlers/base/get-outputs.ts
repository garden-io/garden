/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deline } from "../../../util/string"
import { PluginActionParamsBase, actionParamsSchema } from "../../base"
import { joi, joiVariables, DeepPrimitiveMap } from "../../../config/common"
import { templateStringLiteral } from "../../../docs/common"
import { BaseAction, Resolved } from "../../../actions/base"
import { ActionTypeHandlerSpec } from "./base"

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
