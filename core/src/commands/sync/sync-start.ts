/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BooleanParameter, StringsParameter } from "../../cli/params"
import { joi } from "../../config/common"
import { printHeader } from "../../logger/util"
import { DeployTask } from "../../tasks/deploy"
import { dedent, naturalList } from "../../util/string"
import { Command, CommandParams, CommandResult, PrepareParams } from "../base"
import Bluebird from "bluebird"
import chalk from "chalk"
import { ParameterError, RuntimeError } from "../../exceptions"
import { SyncMonitor } from "../../monitors/sync"

const syncStartArgs = {
  names: new StringsParameter({
    help: "The name(s) of one or more deploy(s) (or services if using modules) to sync. You may specify multiple names, separated by spaces. To start all possible syncs, specify '*' as an argument.",
    required: true,
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
}
type Args = typeof syncStartArgs

const syncStartOpts = {
  "deploy": new BooleanParameter({
    help: "Deploy the specified actions, if they're out of date and/or not deployed in sync mode.",
  }),
  "with-dependencies": new BooleanParameter({
    help: "When deploying actions, also include any runtime dependencies. Ignored if --deploy is not set.",
  }),
  "monitor": new BooleanParameter({
    aliases: ["m"],
    help: "Keep the process running and print sync status logs after starting them.",
  }),
}
type Opts = typeof syncStartOpts

export class SyncStartCommand extends Command<Args, Opts> {
  name = "start"
  help = "Start any configured syncs to the given Deploy action(s)."

  protected = true

  arguments = syncStartArgs
  options = syncStartOpts

  description = dedent`
    Start a sync between your local project directory and one or more Deploys.

    Examples:
        # start syncing to the 'api' Deploy, fail if it's not already deployed in sync mode
        garden start sync api

        # deploy 'api' in sync mode and dependencies if needed, then start syncing
        garden start sync api --deploy

        # start syncing to every Deploy already deployed in sync mode
        garden start sync '*'

        # start syncing to every Deploy that supports it, deploying if needed
        garden start sync '*' --deploy

        # start syncing to every Deploy that supports it, deploying if needed including runtime dependencies
        garden start sync '*' --deploy --include-dependencies

        # start syncing to the 'api' and 'worker' Deploys
        garden start sync api worker

        # start syncing to the 'api' Deploy and keep the process running, following sync status messages
        garden start sync api -f
  `

  outputsSchema = () => joi.object()

  printHeader({ headerLog }) {
    printHeader(headerLog, "Starting sync(s)", "🔁")
  }

  maybePersistent({ opts }: PrepareParams<Args, Opts>) {
    return !!opts.monitor
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<{}>> {
    const { garden, log, args, opts } = params

    const names = args.names || []

    if (names.length === 0) {
      log.warn({ msg: `No names specified. Aborting. Please specify '*' if you'd like to start all possible syncs.` })
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
          log.warn({
            section: action.key(),
            msg: chalk.yellow(`${action.longDescription()} does not support syncing.`),
          })
        } else {
          log.debug({ section: action.key(), msg: `${action.longDescription()} does not support syncing.` })
        }
        return false
      }
      return true
    })

    const actionKeys = actions.map((a) => a.key())

    if (actions.length === 0) {
      throw new ParameterError(`No matched action supports syncing. Aborting.`, { actionKeys })
    }

    if (opts.deploy) {
      // Deploy and start syncs
      const tasks = actions.map((action) => {
        const task = new DeployTask({
          garden,
          graph,
          log,
          action,
          force: false,
          forceActions: [],
          skipRuntimeDependencies: !opts["with-dependencies"],
          startSync: true,
        })
        if (opts.monitor) {
          task.on("ready", ({ result }) => {
            const executedAction = result?.executedAction
            const monitor = new SyncMonitor({ garden, log, command: this, action: executedAction, graph })
            garden.monitors.add(monitor)
          })
        }
        return task
      })
      await garden.processTasks({ tasks, log })
      log.info(chalk.green("\nDone!"))
      return {}
    } else {
      // Don't deploy, just start syncs
      const tasks = actions.map((action) => {
        return new DeployTask({
          garden,
          graph,
          log,
          action,
          force: false,
          forceActions: [],
          skipRuntimeDependencies: true,
          startSync: true,
        })
      })

      const statusResult = await garden.processTasks({ log, tasks, statusOnly: true })
      let someSyncStarted = false

      const router = await garden.getActionRouter()

      await Bluebird.map(tasks, async (task) => {
        const action = task.action
        const section = action.key()
        const result = statusResult.results.getResult(task)

        const mode = result?.result?.detail?.mode
        const state = result?.result?.detail?.state
        const executedAction = result?.result?.executedAction

        if (executedAction && (state === "outdated" || state === "ready")) {
          if (mode !== "sync") {
            log.warn({
              section,
              msg: chalk.yellow(
                `Not deployed in sync mode, cannot start sync. Try running this command with \`--deploy\` set.`
              ),
            })
            return
          }
          // Attempt to start sync even if service is outdated but in sync mode
          try {
            await router.deploy.startSync({ log, action: executedAction, graph })
            someSyncStarted = true

            if (opts.monitor) {
              const monitor = new SyncMonitor({ garden, log, command: this, action: executedAction, graph })
              garden.monitors.add(monitor)
            }
          } catch (error) {
            log.warn({
              section,
              msg: chalk.yellow(dedent`
                Failed starting sync for ${action.longDescription()}: ${error}

                You may need to re-deploy the action. Try running this command with \`--deploy\` set, or running \`garden deploy --sync\` before running this command again.
              `),
            })
          }
        } else {
          log.warn({
            section,
            msg: chalk.yellow(`${action.longDescription()} is not deployed, cannot start sync.`),
          })
        }
      })

      if (!someSyncStarted) {
        throw new RuntimeError(`Could not start any sync. Aborting.`, {
          actionKeys,
        })
      }

      if (garden.monitors.getAll().length === 0) {
        log.info(chalk.green("\nDone!"))
      }
      return {}
    }
  }
}
