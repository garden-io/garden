/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import { baseActionConfigSchema, BaseActionConfig } from "../actions/base"
import { templateStringLiteral } from "../docs/common"
import { apiVersionSchema, DeepPrimitiveMap, joi, joiSparseArray, joiUserIdentifier, joiVariables } from "./common"
import { varfileDescription } from "./project"

export interface GroupConfig {
  // Basics
  apiVersion?: string
  kind: "Group"
  name: string
  description?: string

  // Location / internal metadata
  path?: string

  // Variables
  variables?: DeepPrimitiveMap
  varfiles?: string[]

  // Actions
  actions: BaseActionConfig[]
}

export const groupConfig = () =>
  joi.object().keys({
    // Basics
    apiVersion: apiVersionSchema(),
    kind: joi.string().required().allow("Group"),
    name: joiUserIdentifier()
      .required()
      .description("A valid name for the group. Must be unique across all groups **and modules** in your project."),
    description: joi.string().description("A description of the group."),

    // Variables
    variables: joiVariables().default(() => undefined).description(dedent`
      A map of variables scoped to the actions in this group. These are resolved before the actions and take precedence over project-scoped variables. They may reference project-scoped variables, and generally use any template strings normally allowed when resolving the action.
    `),
    varfiles: joiSparseArray(joi.posixPath())
      .description(
        dedent`
          Specify a list of paths (relative to the directory where the group is defined) to a file containing variables, that we apply on top of the group-level \`variables\` field. If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the previous ones.

          ${varfileDescription}

          To use different group-level varfiles in different environments, you can template in the environment name to the varfile name, e.g. \`varfile: "my-action.\$\{environment.name\}.env\` (this assumes that the corresponding varfiles exist).

          If a listed varfile cannot be found, it is ignored.
        `
      )
      .example("my-action.env"),

    // Actions
    actions: joiSparseArray(baseActionConfigSchema()).description(
      dedent`
        A list of actions to include in this group.

        The actions can additionally reference ${templateStringLiteral("group.name")} in template strings,
        but should otherwise be specified like actions are normally.
      `
    ),
  })
