/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import { dedent } from "../../../util/string"
import { joi } from "../../../config/common"
import { templateStringLiteral } from "../../../docs/common"

export interface DescribeModuleTypeParams {}
export const describeModuleTypeParamsSchema = () => joi.object().keys({})

export interface ModuleTypeDescription {
  docs: string
  // TODO: specify the schemas using primitives (e.g. JSONSchema/OpenAPI) and not Joi objects
  moduleOutputsSchema?: Joi.ObjectSchema
  schema: Joi.ObjectSchema
  serviceOutputsSchema?: Joi.ObjectSchema
  taskOutputsSchema?: Joi.ObjectSchema
  title?: string
}

export const describeType = () => ({
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

  paramsSchema: joi.object().keys({}),

  resultSchema: joi.object().keys({
    docs: joi
      .string()
      .required()
      .description("Documentation for the module type, in markdown format."),
    // TODO: specify the schemas using primitives and not Joi objects
    moduleOutputsSchema: joi.object().default(() => joi.object().keys({})).description(dedent`
          A valid Joi schema describing the keys that each module outputs at config time, for use in template strings
          (e.g. ${templateStringLiteral("modules.my-module.outputs.some-key")}).

          If no schema is provided, an error may be thrown if a module attempts to return an output.
        `),
    schema: joi
      .object()
      .required()
      .description(
        "A valid Joi schema describing the configuration keys for the `module` " + "field in the module's `garden.yml`."
      ),
    serviceOutputsSchema: joi.object().default(() => joi.object().keys({})).description(dedent`
          A valid Joi schema describing the keys that each service outputs at runtime, for use in template strings
          and environment variables (e.g. ${templateStringLiteral("runtime.services.my-service.outputs.some-key")} and
          \`GARDEN_SERVICES_MY_SERVICE__OUTPUT_SOME_KEY\`).

          If no schema is provided, an error may be thrown if a service attempts to return an output.
        `),
    taskOutputsSchema: joi.object().default(() => joi.object().keys({})).description(dedent`
          A valid Joi schema describing the keys that each task outputs at runtime, for use in template strings
          and environment variables (e.g. ${templateStringLiteral("runtime.tasks.my-task.outputs.some-key")} and
          \`GARDEN_TASKS_MY_TASK__OUTPUT_SOME_KEY\`).

          If no schema is provided, an error may be thrown if a task attempts to return an output.
        `),
    title: joi
      .string()
      .description(
        "Readable title for the module type. Defaults to the title-cased type name, with dashes replaced by spaces."
      ),
  }),
})
