/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import type { ConfigureModuleParams, ConfigureModuleResult } from "./handlers/Module/configure.js"
import { configure } from "./handlers/Module/configure.js"
import { joiIdentifier, joi, joiSchema, createSchema } from "../config/common.js"
import type { GardenModule } from "../types/module.js"
import type { ActionHandlerParamsBase, WrappedActionHandler } from "./base.js"
import { outputSchemaDocs } from "./base.js"
import { mapValues, memoize } from "lodash-es"
import { dedent } from "../util/string.js"
import { templateStringLiteral } from "../docs/common.js"
import type { GetModuleOutputsParams, GetModuleOutputsResult } from "./handlers/Module/get-outputs.js"
import { getModuleOutputs } from "./handlers/Module/get-outputs.js"
import type { ConvertModuleParams, ConvertModuleResult } from "./handlers/Module/convert.js"
import { convert } from "./handlers/Module/convert.js"
import { baseHandlerSchema } from "./handlers/base/base.js"
import type { ResolvedActionHandlerDescriptions } from "./plugin.js"

export type ModuleActionHandler<P extends ActionHandlerParamsBase, O> = ((params: P) => Promise<O>) & {
  handlerType?: string
  pluginName?: string
  base?: ModuleActionHandler<P, O>
}

export type WrappedModuleActionHandler<P extends ActionHandlerParamsBase, O> = WrappedActionHandler<P, O> & {
  wrapped: ModuleActionHandler<P, O>
  base?: WrappedModuleActionHandler<P, O>
}

export type ModuleActionHandlers<T extends GardenModule = GardenModule> = {
  [P in keyof ModuleActionParams<T>]: ModuleActionHandler<ModuleActionParams<T>[P], ModuleActionOutputs[P]>
}

export type ModuleActionMap = {
  [A in keyof ModuleActionHandlers]: {
    [moduleType: string]: {
      [pluginName: string]: ModuleActionHandlers[A]
    }
  }
}
export type ModuleActionName = keyof ModuleActionParams

interface _ModuleActionParams<T extends GardenModule = GardenModule> {
  configure: ConfigureModuleParams<T>
  convert: ConvertModuleParams<T>
  getModuleOutputs: GetModuleOutputsParams<T>
}

// Specify base parameter more precisely than the base schema
export type ModuleActionParams<T extends GardenModule = GardenModule> = {
  [P in keyof _ModuleActionParams<T>]: _ModuleActionParams<T>[P] & {
    base?: WrappedModuleActionHandler<_ModuleActionParams<T>[P], ModuleActionOutputs[P]>
  }
}

export interface ModuleActionOutputs {
  configure: ConfigureModuleResult
  convert: ConvertModuleResult
  getModuleOutputs: GetModuleOutputsResult
}

// It takes a short while to resolve all these schemas, so we cache the result
let _moduleActionDescriptions: ResolvedActionHandlerDescriptions

export function getModuleHandlerDescriptions(): ResolvedActionHandlerDescriptions {
  if (_moduleActionDescriptions) {
    return _moduleActionDescriptions
  }

  const descriptions = {
    configure,
    convert,
    getModuleOutputs,
  }

  _moduleActionDescriptions = <ResolvedActionHandlerDescriptions>mapValues(descriptions, (f, name) => {
    const desc = f()

    return {
      ...desc,
      name,
      paramsSchema: desc.paramsSchema.keys({
        base: baseHandlerSchema(),
      }),
    }
  })

  return _moduleActionDescriptions
}

export function getModuleHandlerNames() {
  return <ModuleActionName[]>Object.keys(getModuleHandlerDescriptions())
}

export interface ModuleTypeExtension<M extends GardenModule = GardenModule> {
  // Note: This needs to be this verbose because of issues with the TS compiler
  handlers: {
    [T in keyof ModuleActionParams<M>]?: ((params: ModuleActionParams<M>[T]) => Promise<ModuleActionOutputs[T]>) & {
      handlerType?: string
      pluginName?: string
      moduleType?: string
      base?: ModuleActionHandlers[T]
    }
  }
  name: string
  needsBuild: boolean
}

export interface ModuleTypeDefinition<T extends GardenModule = GardenModule> extends ModuleTypeExtension<T> {
  base?: string
  docs: string
  // TODO: specify the schemas using primitives (e.g. JSONSchema/OpenAPI) and not Joi objects
  moduleOutputsSchema?: Joi.ObjectSchema
  schema?: Joi.ObjectSchema
  title?: string
}

export const moduleHandlersSchema = memoize(() =>
  joi
    .object()
    .keys(mapValues(getModuleHandlerDescriptions(), () => joi.func()))
    .description("A map of module action handlers provided by the plugin.")
)

export const extendModuleTypeSchema = createSchema({
  name: "extend-module-type",
  keys: () => ({
    name: joiIdentifier().required().description("The name of module type."),
    handlers: moduleHandlersSchema(),
    needsBuild: joi.boolean().required().description("Specify whether this module type needs to be built."),
  }),
})

export const createModuleTypeSchema = createSchema({
  name: "create-module-type",
  extend: extendModuleTypeSchema,
  keys: () => ({
    base: joiIdentifier().description(dedent`
        Name of module type to use as a base for this module type.

        If specified, providers that support the base module type also work with this module type.
        Note that some constraints apply on the configuration and output schemas. Please see each of the schema
        fields for details.
      `),
    docs: joi.string().description("Documentation for the module type, in markdown format."),
    handlers: joi.object().keys(mapValues(getModuleHandlerDescriptions(), () => joi.func())).description(dedent`
        A map of module action handlers provided by the plugin.
      `),
    // TODO: specify the schemas using JSONSchema instead of Joi objects
    // TODO: validate outputs against the output schemas
    moduleOutputsSchema: joiSchema().description(dedent`
        A valid Joi schema describing the keys that each module outputs at config resolution time,
        for use in template strings (e.g. ${templateStringLiteral("modules.my-module.outputs.some-key")}).

        ${outputSchemaDocs}
      `),
    schema: joiSchema().description(dedent`
        A valid Joi schema describing the configuration keys for the \`module\` field in the module's \`garden.yml\`.

        If the module type has a \`base\`, you must either omit this field to inherit the base's schema, make sure
        that the specified schema is a _superset_ of the base's schema (i.e. only adds or further constrains existing
        fields), _or_ specify a \`configure\` handler that returns a module config compatible with the base's
        schema. This is to ensure that plugin handlers made for the base type also work with this module type.
      `),
    serviceOutputsSchema: joiSchema().description(dedent`
        A valid Joi schema describing the keys that each service outputs at runtime, for use in template strings
        and environment variables (e.g. ${templateStringLiteral("runtime.services.my-service.outputs.some-key")} and
        \`GARDEN_SERVICES_MY_SERVICE__OUTPUT_SOME_KEY\`).

        ${outputSchemaDocs}
      `),
    taskOutputsSchema: joiSchema().description(dedent`
        A valid Joi schema describing the keys that each task outputs at runtime, for use in template strings
        and environment variables (e.g. ${templateStringLiteral("runtime.tasks.my-task.outputs.some-key")} and
        \`GARDEN_TASKS_MY_TASK__OUTPUT_SOME_KEY\`).

        ${outputSchemaDocs}
      `),
    title: joi
      .string()
      .description(
        "Readable title for the module type. Defaults to the title-cased type name, with dashes replaced by spaces."
      ),
  }),
})
