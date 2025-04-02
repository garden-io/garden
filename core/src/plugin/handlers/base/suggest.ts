/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string.js"
import { joi, joiArray } from "../../../config/common.js"
import type { Log } from "../../../logger/log-entry.js"
import type { ActionHandlerParamsBase } from "../../../plugin/plugin.js"
import type { BaseActionConfig } from "../../../actions/types.js"
import { baseActionConfigSchema } from "../../../actions/base.js"
import { ActionTypeHandlerSpec } from "./base.js"

export const maxDescriptionLength = 48

interface SuggestActionsParams extends ActionHandlerParamsBase {
  log: Log
  name: string
  path: string
}

interface ActionSuggestion {
  description: string
  action: BaseActionConfig
}

interface SuggestActionsResult {
  suggestions: ActionSuggestion[]
}

const suggestionSchema = () =>
  joi.object().keys({
    description: joi.string().description(
      dedent`
      A short description (anything longer than ${maxDescriptionLength} chars will be truncated) of the action being suggested. If specified, this is shown in the list of suggested actions in the \`garden create action\` command, to help distinguish between multiple candidates and explain why the suggestion was made.
      `
    ),
    action: baseActionConfigSchema()
      .required()
      .description(
        dedent`
        The action to suggest. This should be an action spec in the same format as a normal action specified in a Garden config file.
        `
      ),
  })

export class SuggestActions extends ActionTypeHandlerSpec<any, SuggestActionsParams, SuggestActionsResult> {
  description = dedent`
    Given a directory path, return a list of suggested actions (if applicable).

    This is used by the \`garden create action\` command, to ease transition of existing projects to Garden, and to automate some of the parameters when defining actions.
  `

  paramsSchema = () =>
    joi.object().keys({
      path: joi
        .string()
        .required()
        .description("The absolute path to the directory where the action is being created."),
    })

  resultSchema = () =>
    joi.object().keys({
      suggestions: joiArray(suggestionSchema()).description("A list of actions to suggest for the given path."),
    })
}
