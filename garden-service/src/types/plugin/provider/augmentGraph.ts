/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginActionParamsBase, actionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { joi, joiArray, joiIdentifier } from "../../../config/common"
import { baseModuleSpecSchema, AddModuleSpec } from "../../../config/module"
import { Provider, providerSchema } from "../../../config/provider"
import { Module, moduleSchema } from "../../module"

export interface AugmentGraphParams extends PluginActionParamsBase {
  modules: Module[]
  providers: Provider[]
}

interface AddDependency {
  by: string
  on: string
}

export interface AugmentGraphResult {
  addBuildDependencies?: AddDependency[]
  addRuntimeDependencies?: AddDependency[]
  addModules?: AddModuleSpec[]
}

export const addModuleSchema = () => baseModuleSpecSchema()

export const augmentGraph = () => ({
  description: dedent`
    Add modules and/or dependency relationships to the project stack graph. See the individual output fields for
    details.

    The handler receives all configured providers and their configs, as well as all previously defined modules
    in the project, including all modules added by any \`augmentGraph\` handlers defined by other providers
    that this provider depends on. Which is to say, all the \`augmentGraph\` handlers are called and their outputs
    applied in dependency order.

    Note that this handler is called frequently when resolving module configuration, so it should return quickly
    and avoid any external I/O.
  `,
  paramsSchema: actionParamsSchema().keys({
    modules: joiArray(moduleSchema()).description(
      dedent`
          A list of all previously defined modules in the project, including all modules added by any \`augmentGraph\`
          handlers defined by other providers that this provider depends on.
        `
    ),
    providers: joiArray(providerSchema()).description("All configured providers in the project."),
  }),
  resultSchema: joi.object().keys({
    addBuildDependencies: joi
      .array()
      .items(
        joi
          .object()
          .optional()
          .keys({
            by: joiIdentifier().description(
              "The _dependant_, i.e. the module that should have a build dependency on `on`."
            ),
            on: joiIdentifier().description("The _dependency, i.e. the module that `by` should depend on."),
          })
      )
      .description(
        dedent`
        Add build dependencies between two modules, where \`by\` depends on \`on\`.

        Both modules must be previously defined in the project, added by one of the providers that this provider depends
        on, _or_ it can be one of the modules specified in \`addModules\`.

        The most common use case for this field is to make an existing module depend on one of the modules specified
        in \`addModules\`.
      `
      ),
    addRuntimeDependencies: joi
      .array()
      .items(
        joi
          .object()
          .optional()
          .keys({
            by: joiIdentifier().description(
              "The _dependant_, i.e. the service or task that should have a runtime dependency on `on`."
            ),
            on: joiIdentifier().description("The _dependency, i.e. the service or task that `by` should depend on."),
          })
      )
      .description(
        dedent`
        Add runtime dependencies between two services or tasks, where \`by\` depends on \`on\`.

        Both services/tasks must be previously defined in the project, added by one of the providers that this provider
        depends on, _or_ it can be defined in one of the modules specified in \`addModules\`.

        The most common use case for this field is to make an existing service or task depend on one of the
        services/tasks specified under \`addModules\`.
      `
      ),
    addModules: joi
      .array()
      .items(addModuleSchema().optional())
      .description(
        dedent`
          Add modules (of any defined kind) to the stack graph. Each should be a module spec in the same format as
          a normal module specified in a \`garden.yml\` config file (which will later be passed to the appropriate
          \`configure\` handler(s) for the module type).

          The added modules can be referenced in \`addBuildDependencies\`, and their services/tasks can be referenced
          in \`addRuntimeDependencies\`.
        `
      ),
  }),
})
