/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import { capitalize } from "lodash-es"
import { BooleanParameter, ChoicesParameter, StringsParameter } from "../../cli/params.js"
import { joi, joiArray } from "../../config/common.js"
import { printHeader } from "../../logger/util.js"
import type { ActionKind } from "../../plugin/action-types.js"
import { deline } from "../../util/string.js"
import type { CommandParams, CommandResult } from "../base.js"
import type { GetActionsCommandResult } from "./get-actions.js"
import { GetActionsCommand, getActionsCmdOutputSchema } from "./get-actions.js"

type Args = {
  names: StringsParameter
}
type Opts = {
  "detail": BooleanParameter
  "include-state": BooleanParameter
  "sort": ChoicesParameter
}

/**
 * An abstract base class for get actions subcommands
 * e.g. get builds, deploys, runs, tests.
 * These commands are same as calling get actions command with option kind
 */
export abstract class GetActionsSubCommand extends GetActionsCommand {
  private readonly kind: ActionKind
  private readonly kindLowercaseString: string

  constructor(kind: ActionKind) {
    super()
    this.kind = kind
    this.kindLowercaseString = kind.toLowerCase()
    this.name = `${this.kindLowercaseString}s`
    this.aliases = [this.kindLowercaseString, this.kind]
    this.description = this.generateDescription()
    this.help = `Lists the ${this.kindLowercaseString} actions defined in your project.`

    this.arguments = {
      names: new StringsParameter({
        help: deline`
        Specify name(s) of the ${this.kindLowercaseString} action(s) to list. You may specify multiple actions, separated by spaces. Skip to return all ${this.kindLowercaseString} actions.
      `,
        spread: true,
        required: false,
        getSuggestions: ({ configDump }) => {
          return Object.keys(configDump.actionConfigs[this.kind])
        },
      }),
    }
    this.options = {
      "detail": new BooleanParameter({
        help: deline`
        Show the detailed info for each ${this.kindLowercaseString} action, including path, dependencies, dependents, associated module and if the ${this.kindLowercaseString} action is disabled.
      `,
      }),
      "include-state": new BooleanParameter({
        help: `Include state of ${this.kindLowercaseString}(s) in output.`,
      }),
      "sort": new ChoicesParameter({
        help: deline`Sort the ${this.kindLowercaseString} actions result by action name or type.
      By default ${this.kindLowercaseString} action results are sorted by name.
      `,
        choices: ["name", "type"],
        defaultValue: "name",
      }),
    } as any

    this.outputsSchema = () =>
      joi.object().keys({
        actions: joiArray(getActionsCmdOutputSchema()).description(
          `A list of the ${this.kindLowercaseString} actions.`
        ),
      })
  }

  override printHeader({ log }) {
    printHeader(log, capitalize(this.name), "📖")
  }

  override async action(params: CommandParams<Args, Opts>): Promise<CommandResult<GetActionsCommandResult>> {
    const getActionCmdParams = {
      ...params,
      opts: {
        ...params.opts,
        kind: this.kindLowercaseString,
      },
    }
    return super.action(getActionCmdParams)
  }

  private generateDescription(): string {
    return dedent`
    Lists all or specified ${this.kindLowercaseString} action(s). Use with --output=json and jq to extract specific fields.

    Examples:

      garden get ${this.name}                      # list all ${this.kindLowercaseString} actions in the project
      garden get ${this.name} --include-state      # list all ${this.kindLowercaseString} actions in the project including action state in output
      garden get ${this.name} --detail             # list all ${this.kindLowercaseString} actions in project with detailed info
      garden get ${this.name} A B --sort type      # list only ${this.kindLowercaseString} actions A and B sorted by type
  `
  }
}
