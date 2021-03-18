/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { AddModuleSpec } from "../../../config/module"
import { joi, joiArray } from "../../../config/common"
import { addModuleSchema } from "../provider/augmentGraph"
import { LogEntry } from "../../../logger/log-entry"
import { ActionHandlerParamsBase } from "../plugin"

export const maxDescriptionLength = 48

export interface SuggestModulesParams extends ActionHandlerParamsBase {
  log: LogEntry
  name: string
  path: string
}

export interface ModuleSuggestion {
  description: string
  module: AddModuleSpec
}

export interface SuggestModulesResult {
  suggestions: ModuleSuggestion[]
}

const suggestionSchema = () =>
  joi.object().keys({
    description: joi.string().description(
      dedent`
    A short description (anything longer than ${maxDescriptionLength} chars will be truncated) of the module being suggested. If specified, this is shown in the list of suggested modules in the \`garden create module\` command, to help distinguish between multiple candidates and explain why the suggestion was made.
    `
    ),
    module: addModuleSchema()
      .required()
      .description(
        dedent`
    The module to suggest. This should be a module spec in the same format as a normal module specified in a \`garden.yml\` config file.
    `
      ),
  })

export const suggestModules = () => ({
  description: dedent`
    Given a directory path, return a list of suggested modules (if applicable).

    This is used by the \`garden create module\` command, to ease transition of existing projects to Garden, and to automate some of the parameters when defining modules.
  `,

  paramsSchema: joi.object().keys({
    path: joi.string().required().description("The absolute path to the directory where the module is being created."),
  }),

  resultSchema: joi.object().keys({
    suggestions: joiArray(suggestionSchema()).description("A list of modules to suggest for the given path."),
  }),
})
