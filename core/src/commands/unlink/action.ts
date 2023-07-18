/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"

import { Command, CommandResult, CommandParams } from "../base"
import { removeLinkedSources } from "../../util/ext-source-util"
import { printHeader } from "../../logger/util"
import { LinkedSource } from "../../config-store/local"
import { StringsParameter, BooleanParameter } from "../../cli/params"
import { actionKinds } from "../../actions/types"

const unlinkActionArguments = {
  actions: new StringsParameter({
    help: "The name(s) of the action(s) to unlink. You may specify multiple actions, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return actionKinds.flatMap((kind) => Object.keys(configDump.actionConfigs[kind]).map((name) => `${kind}.${name}`))
    },
  }),
}

const unlinkActionOptions = {
  all: new BooleanParameter({
    help: "Unlink all actions.",
  }),
}

type Args = typeof unlinkActionArguments
type Opts = typeof unlinkActionOptions

export class UnlinkActionCommand extends Command<Args, Opts> {
  name = "action"
  override aliases = ["actions"]

  help = "Unlink a previously linked remote action from its local directory."
  override arguments = unlinkActionArguments
  override options = unlinkActionOptions

  override description = dedent`
    After unlinking a remote action, Garden will go back to reading the action's source from its remote repository instead of its local directory.

    Examples:

        garden unlink action build.my-build  # unlinks Build my-build
        garden unlink action --all           # unlink all actions
  `

  override printHeader({ log }) {
    printHeader(log, "Unlink action", "⛓️")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<LinkedSource[]>> {
    const sourceType = "action"

    const { actions = [] } = args

    if (opts.all) {
      await garden.localConfigStore.set("linkedActionSources", {})
      log.info("Unlinked all actions")
      return { result: [] }
    }

    const linkedActionSources = await removeLinkedSources({
      garden,
      sourceType,
      names: actions,
    })

    log.info(`Unlinked action(s) ${actions.join(" ")}`)

    return { result: linkedActionSources }
  }
}
