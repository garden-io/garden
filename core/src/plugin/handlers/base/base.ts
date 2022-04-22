/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import { ActionKind } from "../../../actions/base"
import { joi } from "../../../config/common"

export abstract class ActionTypeHandlerSpec<K extends ActionKind | "module", P extends {}, R extends {}> {
  abstract description: string
  abstract paramsSchema: () => Joi.ObjectSchema
  abstract resultSchema: () => Joi.ObjectSchema

  // These are used internally to map types
  _kindType: K
  _paramsType: P
  _resultType: R
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
