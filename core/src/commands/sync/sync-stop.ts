/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { StringsParameter } from "../../cli/params.js"
import { joi } from "../../config/common.js"
import { printHeader } from "../../logger/util.js"
import { dedent, naturalList } from "../../util/string.js"
import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import { createActionLog } from "../../logger/log-entry.js"
import { DOCS_MIGRATION_GUIDE_CEDAR, FeatureNotAvailable } from "../../util/deprecations.js"
import { styles } from "../../logger/styles.js"

const syncStopArgs = {
  names: new StringsParameter({
    help: "The name(s) of one or more Deploy(s) (or services if using modules) to sync. You may specify multiple names, separated by spaces. To start all possible syncs, run the command with no arguments.",
    required: false,
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
  name = "stop" as const
  help = "Stop any active syncs to the given Deploy action(s)."

  override protected = true

  override arguments = syncStopArgs
  override options = syncStopOpts

  override description = dedent`
    Stops one or more active syncs.

    Examples:
        # stop syncing to the 'api' Deploy
        garden sync stop api

        # stop all active syncs
        garden sync stop
  `

  override outputsSchema = () => joi.object()

  override printHeader({ log }) {
    printHeader(log, "Stopping sync(s)", "🔁")
  }

  async action({ garden, log, args, parentCommand }: CommandParams<Args, Opts>): Promise<CommandResult<{}>> {
    if (!parentCommand) {
      throw new FeatureNotAvailable({
        link: `${DOCS_MIGRATION_GUIDE_CEDAR}#syncstopcommand`,
        hint: `This command is only available when using the dev console or in sync mode. Run ${styles.highlight("garden dev")} or ${styles.highlight("garden deploy --sync")} first.`,
      })
    }

    // We default to stopping all syncs.
    const names = args.names || ["*"]

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
          log.warn(`${action.longDescription()} does not support syncing.`)
        }
        return false
      }
      return true
    })

    if (actions.length === 0) {
      log.warn(`No matched action supports syncing. Aborting.`)
      return {}
    }

    const router = await garden.getActionRouter()

    await Promise.all(
      actions.map(async (action) => {
        const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
        actionLog.info("Stopping active syncs (if any)...")

        await router.deploy.stopSync({ log: actionLog, action, graph })

        // Halt any active monitors for the sync
        await Promise.all(garden.monitors.find({ type: "sync", key: action.name }).map((m) => m.stop()))

        actionLog.info("Syncing successfully stopped.")
      })
    )

    log.success({ msg: "\nDone!", showDuration: false })

    return {}
  }
}
