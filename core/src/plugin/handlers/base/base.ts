/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { memoize } from "lodash-es"
import type { ActionKind } from "../../../actions/types.js"
import { joi, joiVariables } from "../../../config/common.js"

export type ParamsBase<_ = any> = {}

export type ActionTypeHandlerParamsType<Handler> =
  Handler extends ActionTypeHandlerSpec<any, infer Params, any> ? Params : never

export abstract class ActionTypeHandlerSpec<
  Kind extends ActionKind,
  Params extends ParamsBase,
  Result extends ParamsBase,
> {
  abstract description: string
  abstract paramsSchema: () => Joi.ObjectSchema
  abstract resultSchema: () => Joi.ObjectSchema

  required = false

  // We used to use these types to extract type information
  // Now we use the generic instead, however TS will erase the generic types
  // if we aren't using them anywhere.
  // For that reason they are stored here, but they should never be accessed
  _kindType?: Kind
  _paramsType?: Params
  _resultType?: Result

  describe() {
    return {
      description: this.description,
      required: this.required,
      paramsSchema: this.paramsSchema().keys({
        base: baseHandlerSchema(),
      }),
      resultSchema: this.resultSchema(),
    }
  }
}

// No way currently to further validate the shape of the super function
export const baseHandlerSchema = memoize(() =>
  joi
    .func()
    .arity(1)
    .description(
      "When a handler is overriding a handler from a base plugin, this is provided to call the base handler. " +
        "This accepts the same parameters as the handler calling it."
    )
)

export const actionOutputsSchema = memoize(() =>
  joiVariables().description(
    "Structured outputs from the execution, as defined by individual action/module types, to be made available for dependencies and in templating."
  )
)
