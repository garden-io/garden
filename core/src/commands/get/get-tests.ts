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

const getTestsArgs = {
  names: new StringsParameter({
    help: deline`
      Specify name(s) of the test action(s) to list. You may specify multiple actions, separated by spaces. Skip to return all test actions.
    `,
    spread: true,
    required: false,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Test)
    },
  }),
}

const getTestsOpts = {
  "detail": new BooleanParameter({
    help: deline`
      Show the detailed info for each test action, including path, dependencies, dependents, associated module and if the test action is disabled.
    `,
    required: false,
  }),
  "include-state": new BooleanParameter({
    help: "Include state of test(s) in output.",
    required: false,
  }),
  "sort": new ChoicesParameter({
    help: deline`Sort the test actions result by action name or type.
    By default test action results are sorted by name.
    `,
    choices: ["name", "type"],
    defaultValue: "name",
    required: false,
  }),
}

type Args = typeof getTestsArgs
type Opts = typeof getTestsOpts

export class GetTestsCommand extends Command {
  name = "tests"
  help = "Lists the tests defined in your project."
  description = dedent`
  Lists all or specified test action(s). Use with --output=json and jq to extract specific fields.

  Examples:

    garden get tests                      # list all test actions in the project
    garden get tests --include-state      # list all test actions in the project including action state in output
    garden get tests --detail             # list all test actions in project with detailed info
    garden get tests A B --sort type      # list only test actions A and B sorted by type
`

  arguments = getTestsArgs
  options = getTestsOpts

  outputsSchema = () =>
    joi.object().keys({
      actions: joiArray(getActionsCmdOutputSchema()).description("A list of the test actions."),
    })

  printHeader({ log }) {
    printHeader(log, "Tests", "📖")
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<GetActionsCommandResult>> {
    // get tests is same as get actions command with --kind test
    // so we call GetActionsCommand with kind: test
    const getActionCmdParams = {
      ...params,
      args: {
        ...params.args,
        actions: params.args.names,
      },
      opts: {
        ...params.opts,
        kind: "test",
      },
    }
    const getActionsCmd = new GetActionsCommand()
    return getActionsCmd.action(getActionCmdParams)
  }
}
