/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { joi, joiArray } from "../../../config/common"
import { LogEntry } from "../../../logger/log-entry"
import { ActionHandlerParamsBase } from "../../../plugin/plugin"
import { BaseActionSpec, baseActionSpec } from "../../../actions/base"

export const maxDescriptionLength = 48

export interface SuggestActionsParams extends ActionHandlerParamsBase {
  log: LogEntry
  name: string
  path: string
}

export interface ActionSuggestion {
  description: string
  action: BaseActionSpec
}

export interface SuggestModulesResult {
  suggestions: ActionSuggestion[]
}

const suggestionSchema = () =>
  joi.object().keys({
    description: joi.string().description(
      dedent`
      A short description (anything longer than ${maxDescriptionLength} chars will be truncated) of the action being suggested. If specified, this is shown in the list of suggested actions in the \`garden create action\` command, to help distinguish between multiple candidates and explain why the suggestion was made.
      `
    ),
    action: baseActionSpec()
      .required()
      .description(
        dedent`
        The action to suggest. This should be an action spec in the same format as a normal action specified in a Garden config file.
        `
      ),
  })

export const suggestModules = () => ({
  description: dedent`
    Given a directory path, return a list of suggested actions (if applicable).

    This is used by the \`garden create action\` command, to ease transition of existing projects to Garden, and to automate some of the parameters when defining actions.
  `,

  paramsSchema: joi.object().keys({
    path: joi.string().required().description("The absolute path to the directory where the action is being created."),
  }),

  resultSchema: joi.object().keys({
    suggestions: joiArray(suggestionSchema()).description("A list of actions to suggest for the given path."),
  }),
})
