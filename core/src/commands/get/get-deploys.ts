/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import { BooleanParameter, ChoicesParameter, StringsParameter } from "../../cli/params"
import { printHeader } from "../../logger/util"
import { deline } from "../../util/string"
import { Command, CommandParams, CommandResult } from "../base"
import { GetActionsCommand, GetActionsCommandResult, getActionsCmdOutputSchema } from "./get-actions"
import { joi, joiArray } from "../../config/common"

const getDeploysArgs = {
  actions: new StringsParameter({
    help: deline`
      Specify name(s) of the deploy action(s) to list. You may specify multiple actions, separated by spaces.
      Skip to return all deploy actions.
    `,
    spread: true,
    required: false,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
}

const getDeploysOpts = {
  "detail": new BooleanParameter({
    help: deline`
      Show the detailed info for each deploy action, including path, dependencies, dependents, associated module and if the deploy action is disabled.
    `,
  }),
  "include-state": new BooleanParameter({
    help: "Include state of deploy(s) in output.",
  }),
  "sort": new ChoicesParameter({
    help: deline`Sort the deploy actions result by action name or type.
    By default deploy action results are sorted by name.
    `,
    choices: ["name", "type"],
    defaultValue: "name",
  }),
}

type Args = typeof getDeploysArgs
type Opts = typeof getDeploysOpts

export class GetDeploysCommand extends Command {
  name = "deploys"
  help = "Outputs all or specified deploy actions."
  description = dedent`
  Outputs all or specified deploy actions. Use with --output=json and jq to extract specific fields.

  Examples:

    garden get deploys                      # list all deploys in the project
    garden get deploys --include-state      # list all deploys actions in the project including action state in output
    garden get deploys --detail             # list all deploys in project with detailed info
    garden get deploys A B --sort type      # list only deploys A and B sorted by type
`

  arguments = getDeploysArgs
  options = getDeploysOpts

  outputsSchema = () =>
    joi.object().keys({
      actions: joiArray(getActionsCmdOutputSchema()).description("A list of the deploy actions."),
    })

  printHeader({ log }) {
    printHeader(log, "Get Deploys", "📖")
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<GetActionsCommandResult>> {
    // get deploys is same as get actions command with --kind deploy
    // so we call GetActionsCommand with kind: deploy
    const getActionCmdParams = {
      ...params,
      opts: {
        ...params.opts,
        kind: "deploy",
      },
    }
    const getActionsCmd = new GetActionsCommand()
    return getActionsCmd.action(getActionCmdParams)
  }
}
