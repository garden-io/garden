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
import { startSyncWithoutDeploy } from "./sync-start.js"
import { DOCS_MIGRATION_GUIDE_CEDAR, FeatureNotAvailable } from "../../util/deprecations.js"
import { styles } from "../../logger/styles.js"

const syncRestartArgs = {
  names: new StringsParameter({
    help: "The name(s) of one or more Deploy(s) (or services if using modules) whose syncs you want to restart. You may specify multiple names, separated by spaces. To restart all possible syncs, specify '*' as an argument.",
    required: true,
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
}
type Args = typeof syncRestartArgs

const syncRestartOpts = {}
type Opts = typeof syncRestartOpts

export class SyncRestartCommand extends Command<Args, Opts> {
  name = "restart" as const
  help = "Restart any active syncs to the given Deploy action(s)."

  override protected = true

  override arguments = syncRestartArgs
  override options = syncRestartOpts

  override description = dedent`
    Restarts one or more active syncs.

    Examples:
        # Restart syncing to the 'api' Deploy
        garden sync restart api

        # Restart all active syncs
        garden sync restart
  `

  override outputsSchema = () => joi.object()

  override printHeader({ log }) {
    printHeader(log, "Restarting sync(s)", "🔁")
  }

  async action({ garden, log, args, parentCommand }: CommandParams<Args, Opts>): Promise<CommandResult<{}>> {
    if (!parentCommand) {
      throw new FeatureNotAvailable({
        link: `${DOCS_MIGRATION_GUIDE_CEDAR}#syncrestartcommand`,
        hint: `This command is only available when using the dev console or in sync mode. Run ${styles.highlight("garden dev")} or ${styles.highlight("garden deploy --sync")} first.`,
      })
    }

    const names = args.names || []

    if (names.length === 0) {
      log.warn({ msg: `No names specified. Aborting. Please specify '*' if you'd like to restart all active syncs.` })
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

    const syncControlLog = log.createLog({ name: "sync-reset" })

    syncControlLog.info({ symbol: "info", msg: "Stopping active syncs..." })

    await Promise.all(
      actions.map(async (action) => {
        const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
        await router.deploy.stopSync({ log: actionLog, action, graph })
      })
    )
    syncControlLog.success("Active syncs stopped")

    syncControlLog.info("Starting stopped syncs...")

    await startSyncWithoutDeploy({
      actions,
      graph,
      garden,
      command: this,
      log,
      monitor: false,
      stopOnExit: false,
    })

    log.success({ msg: "\nDone!", showDuration: false })

    return {}
  }
}
