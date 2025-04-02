/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { dedent } from "../../../util/string.js"
import { joi } from "../../../config/common.js"
import { templateStringLiteral } from "../../../docs/common.js"
import { ActionTypeHandlerSpec } from "./base.js"

// NOTE: THIS IS CURRENTLY NOT USED

interface ActionDescription {
  docs: string
  // TODO: specify the schemas using primitives (e.g. JSONSchema/OpenAPI) and not Joi objects
  outputsSchema?: Joi.ObjectSchema
  schema: Joi.ObjectSchema
  title?: string
}

export class DescribeActionType extends ActionTypeHandlerSpec<any, any, ActionDescription> {
  description = dedent`
    Return documentation and a schema description of the action type.

    The documentation should be in markdown format. A reference for the action type is automatically generated based on the provided schema, and a section appended to the provided documentation.

    The schema should be a valid Joi schema describing the configuration keys that the user should use to declare the action.

    Used when auto-generating framework documentation.

    This action is called on every resolution of the project graph, so it should return quickly and avoid doing any network calls or computation.
  `

  paramsSchema = () => joi.object().keys({})

  resultSchema = () =>
    joi.object().keys({
      docs: joi.string().required().description("Documentation for the action type, in markdown format."),
      // TODO: specify the schemas using primitives and not Joi objects
      outputsSchema: joi.object().default(() => joi.object().keys({})).description(dedent`
      A valid Joi schema describing the keys that each action outputs after execution, for use in template strings
      (e.g. ${templateStringLiteral("builds.my-build.outputs.some-key")}).

      If no schema is provided, an error may be thrown if an action attempts to return an output.
    `),
      schema: joi
        .object()
        .required()
        .description("A valid Joi schema describing the configuration keys for the action configuration."),
      title: joi
        .string()
        .description(
          "Readable title for the action type. Defaults to the title-cased type name, with dashes replaced by spaces."
        ),
    })
}
