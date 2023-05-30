/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import { BooleanParameter, ChoicesParameter, StringsParameter } from "../../cli/params"
import { joi, joiArray } from "../../config/common"
import { printHeader } from "../../logger/util"
import { deline } from "../../util/string"
import { Command, CommandParams, CommandResult } from "../base"
import { GetActionsCommand, GetActionsCommandResult, getActionsCmdOutputSchema } from "./get-actions"

const getBuildsArgs = {
  actions: new StringsParameter({
    help: deline`
      Specify name(s) of the build action(s) to list. You may specify multiple actions, separated by spaces. Skip to return all build actions.
    `,
    spread: true,
    required: false,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Build)
    },
  }),
}

const getBuildsOpts = {
  "detail": new BooleanParameter({
    help: deline`
      Show the detailed info for each build action, including path, dependencies, dependents, associated module and if the build action is disabled.
    `,
  }),
  "include-state": new BooleanParameter({
    help: "Include state of build(s) in output.",
  }),
  "sort": new ChoicesParameter({
    help: deline`Sort the build actions result by action name or type.
    By default build action results are sorted by name.
    `,
    choices: ["name", "type"],
    defaultValue: "name",
  }),
}

type Args = typeof getBuildsArgs
type Opts = typeof getBuildsOpts

export class GetBuildsCommand extends Command {
  name = "builds"
  help = "Outputs all or specified build actions."
  description = dedent`
  Outputs all or specified build action(s). Use with --output=json and jq to extract specific fields.

  Examples:

    garden get builds                      # list all build actions in the project
    garden get builds --include-state      # list all build actions in the project including action state in output
    garden get builds --detail             # list all build actions in project with detailed info
    garden get builds A B --sort type      # list only build actions A and B sorted by type
`

  arguments = getBuildsArgs
  options = getBuildsOpts

  outputsSchema = () =>
    joi.object().keys({
      actions: joiArray(getActionsCmdOutputSchema()).description("A list of the build actions."),
    })

  printHeader({ log }) {
    printHeader(log, "Get Builds", "📖")
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<GetActionsCommandResult>> {
    // get builds is same as get actions command with --kind build
    // so we call GetActionsCommand with kind: build
    const getActionCmdParams = {
      ...params,
      opts: {
        ...params.opts,
        kind: "build",
      },
    }
    const getActionsCmd = new GetActionsCommand()
    return getActionsCmd.action(getActionCmdParams)
  }
}
