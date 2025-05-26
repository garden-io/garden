/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import type { ActionConfig } from "../actions/types.js"
import { baseActionConfigSchema } from "../actions/base.js"
import { templateStringLiteral } from "../docs/common.js"
import type { DeepPrimitiveMap, Varfile } from "./common.js"
import {
  createSchema,
  joi,
  joiArray,
  joiSparseArray,
  joiUserIdentifier,
  joiVarfile,
  joiVariables,
  unusedApiVersionSchema,
} from "./common.js"
import { varfileDescription } from "./base.js"

export interface GroupConfig {
  // Basics
  apiVersion?: string
  kind: "Group"
  name: string
  description?: string

  // Location / internal metadata
  path: string
  internal?: {
    configFilePath?: string
  }

  // Variables
  variables?: DeepPrimitiveMap
  varfiles?: Varfile[]

  // Actions
  actions: ActionConfig[]
}

const varfileName = "my-action.${environment.name}.env"

export const groupConfig = createSchema({
  name: "Group",
  keys: () => ({
    // Basics
    apiVersion: unusedApiVersionSchema(),
    kind: joi.string().required().allow("Group"),
    name: joiUserIdentifier()
      .required()
      .description("A valid name for the group. Must be unique across all groups **and modules** in your project."),
    description: joi.string().description("A description of the group."),

    // Variables
    variables: joiVariables().default(() => undefined).description(dedent`
      A map of variables scoped to the actions in this group. These are resolved before the actions and take precedence over project-scoped variables. They may reference project-scoped variables, and generally use any template strings normally allowed when resolving the action.
    `),
    varfiles: joiArray(joiVarfile())
      .description(
        dedent`
          Specify a list of paths (relative to the directory where the group is defined) to a file containing variables, that we apply on top of the group-level \`variables\` field. If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the previous ones.

          ${varfileDescription}

          To use different group-level varfiles in different environments, you can template in the environment name to the varfile name, e.g. \`varfile: "${varfileName}"\` (this assumes that the corresponding varfiles exist).

          If a listed varfile cannot be found, it is ignored.
        `
      )
      .example("my-action.env"),

    // Actions
    // Note: Further validation happens later
    actions: joiSparseArray(baseActionConfigSchema().unknown(true)).description(
      dedent`
        A list of actions to include in this group.

        The actions can additionally reference ${templateStringLiteral("group.name")} in template strings,
        but should otherwise be specified like actions are normally.
      `
    ),
  }),
})
