/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { StringsParameter } from "../../cli/params"
import { joi } from "../../config/common"
import { printHeader } from "../../logger/util"
import { dedent, naturalList } from "../../util/string"
import { Command, CommandParams, CommandResult } from "../base"
import Bluebird from "bluebird"
import chalk from "chalk"

const syncStopArgs = {
  names: new StringsParameter({
    help: "The name(s) of one or more deploy(s) (or services if using modules) to sync. You may specify multiple names, separated by spaces. To start all possible syncs, specify '*' as an argument.",
    required: true,
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
}
type Args = typeof syncStopArgs

const syncStopOpts = {
  // TODO: add --redeploy option to re-deploy syncs that were in sync mode
}
type Opts = typeof syncStopOpts

export class SyncStopCommand extends Command<Args, Opts> {
  name = "stop"
  help = "Stop any active syncs to the given Deploy action(s)."

  protected = true

  arguments = syncStopArgs
  options = syncStopOpts

  description = dedent`
    Stops one or more active syncs.

    Examples:
        # stop syncing to the 'api' Deploy
        garden stop sync api

        # stop all active syncs
        garden stop sync '*'
  `

  outputsSchema = () => joi.object()

  printHeader({ headerLog }) {
    printHeader(headerLog, "Stopping sync(s)", "🔁")
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<{}>> {
    const { garden, log, args } = params

    const names = args.names || []

    if (names.length === 0) {
      log.warn({ msg: `No names specified. Aborting. Please specify '*' if you'd like to stop all active syncs.` })
      return { result: {} }
    }

    const graph = await garden.getConfigGraph({
      log,
      emit: true,
      actionModes: {
        sync: names.map((n) => "deploy." + n),
      },
    })

    let actions = graph.getDeploys({ includeNames: names })

    if (actions.length === 0) {
      log.warn({
        msg: `No enabled Deploy actions found (matching argument(s) ${naturalList(
          names.map((n) => `'${n}'`)
        )}). Aborting.`,
      })
      return { result: {} }
    }

    actions = actions.filter((action) => {
      if (!action.supportsMode("sync")) {
        if (names.includes(action.name)) {
          log.warn(chalk.yellow(`${action.longDescription()} does not support syncing.`))
        }
        return false
      }
      return true
    })

    if (actions.length === 0) {
      log.warn(chalk.yellow(`No matched action supports syncing. Aborting.`))
      return {}
    }

    const router = await garden.getActionRouter()

    await Bluebird.map(actions, async (action) => {
      const { result: status } = await router.deploy.getSyncStatus({ log, action, graph })
      if (status.state !== "not-active") {
        log.info({ section: action.key(), msg: "Stopping active syncs..." })
        await router.deploy.stopSync({ log, action, graph })
        log.info({ section: action.key(), msg: "Syncing successfully stopped." })
      } else {
        log.info({ section: action.key(), msg: "Syncing not active, nothing to do." })
      }
    })

    log.info(chalk.green("\nDone!"))

    return {}
  }
}
