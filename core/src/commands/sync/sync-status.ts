/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"

import { StringsParameter } from "../../cli/params"
import { joi } from "../../config/common"
import { printHeader } from "../../logger/util"
import { dedent, deline } from "../../util/string"
import { Command, CommandParams, CommandResult } from "../base"
import { createActionLog } from "../../logger/log-entry"
import { PluginEventBroker } from "../../plugin-context"
import { resolvedActionToExecuted } from "../../actions/helpers"
import { GetSyncStatusResult } from "../../plugin/handlers/Deploy/get-sync-status"

const syncStatusArgs = {
  names: new StringsParameter({
    help: deline`
      The name(s) of the Deploy(s) to get the sync status for (skip to get status from
      all Deploys in the project). You may specify multiple names, separated by status.
    `,
    required: false,
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
}
type Args = typeof syncStatusArgs

interface SyncStatusCommandResult {
  result: { [actionName: string]: GetSyncStatusResult }
}

export class SyncStatusCommand extends Command<Args> {
  name = "status"
  help = "Get sync statuses."

  protected = true

  arguments = syncStatusArgs

  description = dedent`TODO`

  outputsSchema = () => joi.object()

  printHeader({ headerLog }) {
    printHeader(headerLog, "Getting sync statuses", "📟")
  }

  async action({ garden, log, args }: CommandParams<Args>): Promise<SyncStatusCommandResult> {
    const router = await garden.getActionRouter()
    const graph = await garden.getResolvedConfigGraph({ log, emit: true })

    // TODO: Filter on actions that actually have sync specs
    const deployActionsWithSyncs = graph.getDeploys({ includeDisabled: true, names: args.names })
    const concurrency = 5

    const syncStatuses: { [actionName: string]: GetSyncStatusResult } = {}

    if (deployActionsWithSyncs.length === 0) {
      // TODO: Better messagess
      log.info(`No syncs configured for the requested Deploys.`)
      log.info(`Click here to learn how to configure syncs...`)
      return { result: {} }
    }

    log.info("")
    log.info(chalk.white(deline`
      Getting sync statuses. For more detailed debug information, run this command with
      this \`--json\` or \`--yaml\` flags.
    `))
    log.info("")

    await Bluebird.map(
      deployActionsWithSyncs,
      async (action) => {
        const events = new PluginEventBroker(garden)
        const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
        const { result: status } = await router.deploy.getStatus({
          graph,
          action,
          log: actionLog,
        })
        const executedAction = resolvedActionToExecuted(action, { status })
        const syncStatus = (
          await router.deploy.getSyncStatus({
            log: actionLog,
            action: executedAction,
            monitor: false,
            graph: graph,
            events: events,
          })
        ).result

        if (!syncStatus.syncs || syncStatus.syncs.length === 0) {
          // TODO: We should be filtering in these in the first place
          return
        }

        let styleFn: chalk.Chalk
        if (syncStatus.state === "active") {
          styleFn = chalk.green
        } else {
          styleFn = chalk.yellow
        }

        log.info(`Deploy Action ${chalk.cyan(action.name)} has ${chalk.cyan(syncStatus.syncs.length)} syncs(s) configured:`)
        for (const sync of syncStatus.syncs) {
          // TODO
          log.info(`Sync status: ${JSON.stringify(sync, null, 4)}`)
        }

        syncStatuses[action.name] = syncStatus
      },
      { concurrency }
    )

    return { result: syncStatuses }
  }
}
