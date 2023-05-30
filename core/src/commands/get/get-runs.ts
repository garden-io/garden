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

const getRunsArgs = {
  names: new StringsParameter({
    help: "Specify run(s)/task(s) to list. You may specify multiple names, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Run)
    },
  }),
}

const getRunsOpts = {
  "detail": new BooleanParameter({
    help: deline`
      Show the detailed info for each run action, including path, dependencies, dependents, associated module and if the run action is disabled.
    `,
    required: false,
  }),
  "include-state": new BooleanParameter({
    help: "Include state of run(s) in output.",
    required: false,
  }),
  "sort": new ChoicesParameter({
    help: deline`Sort the run actions result by action name or type.
    By default run action results are sorted by name.
    `,
    choices: ["name", "type"],
    defaultValue: "name",
    required: false,
  }),
}

type Args = typeof getRunsArgs
type Opts = typeof getRunsOpts

export class GetRunsCommand extends Command {
  name = "runs"
  help = "Lists the Runs (or tasks, if using modules) defined in your project."
  aliases = ["tasks"]
  description = dedent`
  Lists all or specified run action(s). Use with --output=json and jq to extract specific fields.

  Examples:

    garden get runs                      # list all run actions in the project
    garden get runs --include-state      # list all run actions in the project including action state in output
    garden get runs --detail             # list all run actions in project with detailed info
    garden get runs A B --sort type      # list only run actions A and B sorted by type
`

  arguments = getRunsArgs
  options = getRunsOpts

  outputsSchema = () =>
    joi.object().keys({
      actions: joiArray(getActionsCmdOutputSchema()).description("A list of the run actions."),
    })

  printHeader({ log }) {
    printHeader(log, "Runs", "📖")
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<GetActionsCommandResult>> {
    // get runs is same as get actions command with --kind run
    // so we call GetActionsCommand with kind: run
    const getActionCmdParams = {
      ...params,
      opts: {
        ...params.opts,
        kind: "run",
      },
    }
    const getActionsCmd = new GetActionsCommand()
    return getActionsCmd.action(getActionCmdParams)
  }
}
