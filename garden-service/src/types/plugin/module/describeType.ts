/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { dedent } from "../../../util/string"

export interface DescribeModuleTypeParams { }
export const describeModuleTypeParamsSchema = Joi.object()
  .keys({})

export interface ModuleTypeDescription {
  docs: string
  // TODO: specify the schemas using primitives (e.g. JSONSchema/OpenAPI) and not Joi objects
  outputsSchema: Joi.ObjectSchema
  schema: Joi.ObjectSchema
  title?: string
}

export const describeType = {
  description: dedent`
    Return documentation and a schema description of the module type.

    The documentation should be in markdown format. A reference for the module type is automatically
    generated based on the provided schema, and a section appended to the provided documentation.

    The schema should be a valid Joi schema describing the configuration keys that the user
    should use under the \`module\` key in a \`garden.yml\` configuration file.

    Used when auto-generating framework documentation.

    This action is called on every execution of Garden, so it should return quickly and avoid doing
    any network calls.
  `,

  paramsSchema: Joi.object().keys({}),

  resultSchema: Joi.object()
    .keys({
      docs: Joi.string()
        .required()
        .description("Documentation for the module type, in markdown format."),
      // TODO: specify the schemas using primitives and not Joi objects
      outputsSchema: Joi.object()
        .default(Joi.object().keys({}), "{}")
        .description(
          "A valid Joi schema describing the keys that each module outputs, for use in template strings " +
          "(e.g. \`\${modules.my-module.outputs.some-key}\`).",
        ),
      schema: Joi.object()
        .required()
        .description(
          "A valid Joi schema describing the configuration keys for the `module` " +
          "field in the module's `garden.yml`.",
        ),
      title: Joi.string()
        .description(
          "Readable title for the module type. Defaults to the title-cased type name, with dashes replaced by spaces.",
        ),
    }),
}
