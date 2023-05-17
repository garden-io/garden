/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginActionParamsBase, projectActionParamsSchema } from "../../base"
import { dedent } from "../../../util/string"
import { joi, joiArray, createSchema } from "../../../config/common"
import { memoize } from "lodash"
import type { BaseProviderConfig } from "../../../config/provider"

export interface SuggestedCommand {
  name: string
  description: string
  source?: string
  gardenCommand?: string
  shellCommand?: {
    command: string
    args: string[]
    cwd: string
  }
  openUrl?: string
  icon?: {
    name: string
    src?: string
  }
}

export const suggestedCommandSchema = createSchema({
  name: "suggested-command",
  keys: () => ({
    name: joi.string().required().description("Name of the command"),
    description: joi.string().required().description("Short description of what the command does."),
    source: joi.string().description("The source of the suggestion, e.g. a plugin name."),
    gardenCommand: joi.string().description("A Garden command to run (including arguments)."),
    shellCommand: joi
      .object()
      .keys({
        command: joi.string().required().description("The shell command to run (without arguments)."),
        args: joi.array().items(joi.string()).required().description("Arguments to pass to the command."),
        cwd: joi.string().required().description("Absolute path to run the shell command in."),
      })
      .description("A shell command to run."),
    openUrl: joi.string().description("A URL to open in a browser window."),
    icon: joi
      .object()
      .keys({
        name: joi.string().required().description("A string reference (and alt text) for the icon."),
        src: joi.string().description("A URI for the image. May be a data URI."),
      })
      .description("The icon to display next to the command, where applicable (e.g. in dashboard or Garden Desktop)."),
  }),
  xor: [["gardenCommand", "shellCommand", "openUrl"]],
})

export const suggestedCommandsSchema = memoize(() =>
  joiArray(suggestedCommandSchema())
    .optional()
    .description("A list of commands that the provider suggests running in e.g. Garden Desktop.")
    .unique("name")
)

export type SuggestCommandsParams<C extends BaseProviderConfig = any> = PluginActionParamsBase<C>

export interface SuggestCommandsResult {
  commands: SuggestedCommand[]
}

export const suggestCommands = () => ({
  description: dedent`
    Given one of the \`dashboardPages\` configured on the provider, resolve the name/spec into a URL. This is useful to allow for dynamically generated URLs, and to start any on-demand processes required to serve the page.

    The API server will call this handler when the page is requested, and then redirect the request to the returned URL after the handler returns.
  `,
  paramsSchema: projectActionParamsSchema(),
  resultSchema: joi.object().keys({
    commands: suggestedCommandsSchema().required(),
  }),
})
