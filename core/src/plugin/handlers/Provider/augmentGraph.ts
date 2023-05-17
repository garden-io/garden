/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginActionParamsBase, projectActionParamsSchema } from "../../base"
import { dedent } from "../../../util/string"
import { joi, joiArray, joiIdentifierMap } from "../../../config/common"
import { providerSchema, ProviderMap, BaseProviderConfig } from "../../../config/provider"
import { baseActionConfigSchema } from "../../../actions/base"
import type { Action, ActionKind, BaseActionConfig } from "../../../actions/types"

export interface AugmentGraphParams<C extends BaseProviderConfig = any> extends PluginActionParamsBase<C> {
  actions: Action[]
  providers: ProviderMap
}

type Dependency = { kind: ActionKind; name: string }

interface AddDependency {
  by: Dependency
  on: Dependency
}

export interface AugmentGraphResult {
  addDependencies?: AddDependency[]
  addActions?: BaseActionConfig[]
}

export const augmentGraph = () => ({
  description: dedent`
    Add actions and/or dependency relationships to the project stack graph. See the individual output fields for
    details.

    The handler receives all configured providers and their configs, as well as all previously defined actions
    in the project, including all actions added by any \`augmentGraph\` handlers defined by other providers
    that this provider depends on. Which is to say, all the \`augmentGraph\` handlers are called and their outputs
    applied in dependency order.

    Note that this handler is called frequently when resolving action configuration, so it should return quickly
    and avoid any external I/O.
  `,
  paramsSchema: projectActionParamsSchema().keys({
    // allow unknown because BaseAction-s are passed not BaseActionConfigs
    // FIXME: consider fixing this by passing the values of a correct type
    actions: joiArray(baseActionConfigSchema().unknown(true)).description(
      dedent`
          A list of all previously defined actions in the project, including all actions added by any \`augmentGraph\`
          handlers defined by other providers that this provider depends on.
        `
    ),
    providers: joiIdentifierMap(providerSchema()).description("Map of all configured providers in the project."),
  }),
  resultSchema: joi.object().keys({
    addDependencies: joi
      .array()
      .items(
        joi
          .object()
          .optional()
          .keys({
            by: joi
              .actionReference()
              .description("The _dependant_, i.e. the action that should have a dependency on `on`."),
            on: joi.actionReference().description("The _dependency, i.e. the action that `by` should depend on."),
          })
      )
      .description(
        dedent`
        Add dependencies between different actions, where \`by\` depends on \`on\`.

        Both actions must be previously defined in the project, added by one of the providers that this provider depends on, _or_ it can be defined in one of the actions specified in \`addActions\`.

        The most common use case for this field is to make an existing action depend on one of the actions specified under \`addActions\`.
      `
      ),
    addActions: joi
      .array()
      .items(baseActionConfigSchema().unknown(true).optional())
      .description(
        dedent`
          Add actions (of any defined kind) to the stack graph. Each should be an action spec in the same format as a normal action specified in a \`garden.yml\` config file (which will later be passed to the appropriate \`configure\` handler(s) for the action type).

          Added actions can be referenced in \`addDependencies\`.
        `
      ),
  }),
})
