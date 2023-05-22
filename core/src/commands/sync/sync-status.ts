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
import { dedent, deline, naturalList } from "../../util/string"
import { Command, CommandParams } from "../base"
import { createActionLog } from "../../logger/log-entry"
import { PluginEventBroker } from "../../plugin-context"
import { resolvedActionToExecuted } from "../../actions/helpers"
import { GetSyncStatusResult } from "../../plugin/handlers/Deploy/get-sync-status"
import { isEmpty } from "lodash"

const syncStatusArgs = {
  names: new StringsParameter({
    help: deline`
      The name(s) of the Deploy(s) to get the sync status for (skip to get status from
      all Deploys in the project). You may specify multiple names, separated by space.
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
  result: {
    actions: {
      [actionName: string]: GetSyncStatusResult
    }
  }
}

export class SyncStatusCommand extends Command<Args> {
  name = "status"
  help = "Get sync statuses."

  protected = true

  arguments = syncStatusArgs

  description = dedent`
    Get the current status of the configured syncs for this project.

    Examples:
        # get all sync statuses
        garden sync status

        # get sync statuses for the 'api' Deploy
        garden sync status api

        # output detailed sync statuses in JSON format
        garden sync status -o json

        # output detailed sync statuses in YAML format
        garden sync status -o yaml
  `

  outputsSchema = () => joi.object()

  printHeader({ log }) {
    printHeader(log, "Getting sync statuses", "📟")
  }

  async action({ garden, log, args }: CommandParams<Args>): Promise<SyncStatusCommandResult> {
    const router = await garden.getActionRouter()
    const graph = await garden.getResolvedConfigGraph({ log, emit: true })

    const deployActions = graph
      .getDeploys({ includeDisabled: false, names: args.names })
      .sort((a, b) => (a.name > b.name ? 1 : -1))
    // This is fairly arbitrary
    const concurrency = 5

    const syncStatuses: { [actionName: string]: GetSyncStatusResult } = {}

    log.info("")
    log.info(
      chalk.white(deline`
      Getting sync statuses. For more detailed debug information, run this command with
      the \`--output json\` or \`--output yaml\` flags.
    `)
    )
    log.info("")

    await Bluebird.map(
      deployActions,
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
            graph,
            events,
          })
        ).result

        const syncs = syncStatus.syncs
        if (!syncs || syncs.length === 0) {
          return
        }

        // Return the syncs sorted
        const sorted = syncs.sort((a, b) => {
          const keyA = a.source + a.target + a.mode
          const keyB = b.source + b.target + b.mode
          return keyA > keyB ? 1 : -1
        })
        syncStatus["syncs"] = sorted

        const styleFn =
          {
            "active": chalk.green,
            "failed": chalk.red,
            "not-active": chalk.yellow,
          }[syncStatus.state] || chalk.bold.dim

        const verbMap = {
          "active": "is",
          "failed": "has",
          "not-active": "is",
        }

        log.info(
          `The ${chalk.cyan(action.name)} Deploy has ${chalk.cyan(syncStatus.syncs.length)} syncs(s) configured:`
        )
        const leftPad = "  →"
        syncs.forEach((sync, idx) => {
          const state = sync.state
          log.info(
            `${leftPad} Sync from ${chalk.cyan(sync.source)} to ${chalk.cyan(sync.target)} ${verbMap[state]} ${styleFn(
              state
            )}`
          )
          sync.mode && log.info(chalk.bold(`${leftPad} Mode: ${sync.mode}`))
          sync.syncCount && log.info(chalk.bold(`${leftPad} Sync count: ${sync.syncCount}`))
          if (state === "failed" && sync.message) {
            log.info(`${chalk.bold(leftPad)} ${chalk.yellow(sync.message)}`)
          }
          idx !== syncs.length - 1 && log.info("")
        })
        log.info("")

        syncStatuses[action.name] = syncStatus
      },
      { concurrency }
    )

    if (isEmpty(syncStatuses) && args.names && args.names.length > 0) {
      log.warn(`No syncs have been configured for the requested Deploys (${naturalList(args.names!)}).`)
    } else if (isEmpty(syncStatuses)) {
      log.warn(deline`
        No syncs have been configured in this project.

        Follow the link below to learn how to enable live code syncing with Garden:
      `)
      log.info("")
      log.info(chalk.cyan.underline("https://docs.garden.io/guides/code-synchronization-dev-mode"))
    }

    return { result: { actions: syncStatuses } }
  }
}
