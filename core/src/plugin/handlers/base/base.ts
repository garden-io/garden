/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import { ActionKind, BaseActionConfig } from "../../../actions/base"
import { joi, joiVariables } from "../../../config/common"

export type ParamsBase<_ = any> = {}

export abstract class ActionTypeHandlerSpec<
  K extends ActionKind,
  P extends ParamsBase,
  R extends ParamsBase,
  C = BaseActionConfig
> {
  abstract description: string
  abstract paramsSchema: () => Joi.ObjectSchema
  abstract resultSchema: () => Joi.ObjectSchema

  required = false

  // These are used internally to map types
  _kindType: K
  _configType: C
  _paramsType: P
  _resultType: R

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
export const baseHandlerSchema = () =>
  joi
    .func()
    .arity(1)
    .description(
      "When a handler is overriding a handler from a base plugin, this is provided to call the base handler. " +
        "This accepts the same parameters as the handler calling it."
    )

export const actionOutputsSchema = () =>
  joiVariables().description(
    "Structured outputs from the execution, as defined by individual action/module types, to be made available for dependencies and in templating."
  )

export interface BaseRunParams {
  command?: string[]
  args: string[]
  interactive: boolean
  timeout?: number
}
