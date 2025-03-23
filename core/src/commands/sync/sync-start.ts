/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BooleanParameter, StringsParameter } from "../../cli/params.js"
import { joi } from "../../config/common.js"
import { printHeader } from "../../logger/util.js"
import { DeployTask } from "../../tasks/deploy.js"
import { dedent, naturalList } from "../../util/string.js"
import type { CommandParams, CommandResult, PrepareParams } from "../base.js"
import { Command } from "../base.js"
import { ParameterError, RuntimeError } from "../../exceptions.js"
import { SyncMonitor } from "../../monitors/sync.js"
import type { Log } from "../../logger/log-entry.js"
import { createActionLog } from "../../logger/log-entry.js"
import type { DeployAction } from "../../actions/deploy.js"
import type { ConfigGraph } from "../../graph/config-graph.js"
import type { Garden } from "../../index.js"
import { DOCS_MIGRATION_GUIDE_CEDAR, FeatureNotAvailable } from "../../util/deprecations.js"
import { styles } from "../../logger/styles.js"

const syncStartArgs = {
  names: new StringsParameter({
    help: "The name(s) of one or more Deploy(s) (or services if using modules) to sync. You may specify multiple names, separated by spaces. To start all possible syncs, specify '*' as an argument.",
    required: false,
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
  name = "start" as const
  help = "Start any configured syncs to the given Deploy action(s)."

  override protected = true

  override arguments = syncStartArgs
  override options = syncStartOpts

  override description = dedent`
    Start a sync between your local project directory and one or more Deploys.

    Examples:
        # start syncing to the 'api' Deploy, fail if it's not already deployed in sync mode
        garden sync start api

        # deploy 'api' in sync mode and dependencies if needed, then start syncing
        garden sync start api --deploy

        # start syncing to every Deploy already deployed in sync mode
        garden sync start

        # start syncing to every Deploy that supports it, deploying if needed
        garden sync start '*' --deploy

        # start syncing to every Deploy that supports it, deploying if needed including runtime dependencies
        garden sync start --deploy --include-dependencies

        # start syncing to the 'api' and 'worker' Deploys
        garden sync start api worker

        # start syncing to the 'api' Deploy and keep the process running, following sync status messages
        garden sync start api -f
  `

  override outputsSchema = () => joi.object()

  override printHeader({ log }) {
    printHeader(log, "Starting sync(s)", "🔁")
  }

  override maybePersistent({ opts }: PrepareParams<Args, Opts>) {
    return !!opts.monitor
  }

  async action({
    garden,
    log,
    args,
    opts,
    commandLine,
    parentCommand,
  }: CommandParams<Args, Opts>): Promise<CommandResult<{}>> {
    if (!parentCommand) {
      throw new FeatureNotAvailable({
        link: `${DOCS_MIGRATION_GUIDE_CEDAR}#syncstartcommand`,
        hint: `This command is only available when using the dev console or in sync mode. Run ${styles.highlight("garden dev")} or ${styles.highlight("garden deploy --sync")} first.`,
      })
    }

    // We default to starting syncs for all Deploy actions
    const names = args.names || ["*"]

    // We want to stop any started syncs on exit if we're calling `sync start` from inside the `dev` command.
    const stopOnExit = !!commandLine

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
      const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
      if (!action.supportsMode("sync")) {
        if (names.includes(action.name)) {
          actionLog.warn(`${action.longDescription()} does not support syncing.`)
        } else {
          actionLog.debug(`${action.longDescription()} does not support syncing.`)
        }
        return false
      }
      return true
    })

    if (actions.length === 0) {
      throw new ParameterError({ message: `No matched action supports syncing. Aborting.` })
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
            const monitor = new SyncMonitor({ garden, log, action: executedAction, graph, stopOnExit })
            garden.monitors.addAndSubscribe(monitor, this)
          })
        }
        return task
      })
      await garden.processTasks({ tasks })
      log.success({ msg: "\nDone!", showDuration: false })
      return {}
    } else {
      // Don't deploy, just start syncs
      await startSyncWithoutDeploy({
        actions,
        graph,
        garden,
        command: this,
        log,
        monitor: opts.monitor,
        stopOnExit,
      })
      if (garden.monitors.getAll().length === 0) {
        log.success({ msg: "\nDone!", showDuration: false })
      }
      return {}
    }
  }
}

export async function startSyncWithoutDeploy({
  actions,
  graph,
  garden,
  command,
  log,
  monitor,
  stopOnExit,
}: {
  actions: DeployAction[]
  graph: ConfigGraph
  garden: Garden
  command: Command
  log: Log
  monitor: boolean
  stopOnExit: boolean
}) {
  const actionKeys = actions.map((a) => a.key())
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

  const statusResult = await garden.processTasks({ tasks, statusOnly: true })
  let someSyncStarted = false

  const router = await garden.getActionRouter()

  await Promise.all(
    tasks.map(async (task) => {
      const action = task.action
      const result = statusResult.results.getResult(task)

      const mode = result?.result?.detail?.mode
      const state = result?.result?.detail?.state
      const executedAction = result?.result?.executedAction
      const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })

      if (executedAction && (state === "outdated" || state === "ready")) {
        if (mode !== "sync") {
          actionLog.warn(
            `Not deployed in sync mode, cannot start sync. Try running this command with \`--deploy\` set.`
          )
          return
        }
        // Attempt to start sync even if service is outdated but in sync mode
        try {
          await router.deploy.startSync({ log: actionLog, action: executedAction, graph })
          someSyncStarted = true

          if (monitor) {
            const m = new SyncMonitor({ garden, log, action: executedAction, graph, stopOnExit })
            garden.monitors.addAndSubscribe(m, command)
          }
        } catch (error) {
          actionLog.warn(
            dedent`
            Failed starting sync for ${action.longDescription()}: ${error}

            You may need to re-deploy the action. Try running this command with \`--deploy\` set, or running \`garden deploy --sync\` before running this command again.
          `
          )
        }
      } else {
        actionLog.warn(`${action.longDescription()} is not deployed, cannot start sync.`)
      }
    })
  )

  if (!someSyncStarted) {
    throw new RuntimeError({
      message: dedent`
        Could not start any syncs. Aborting.${actionKeys ? `\n\nActions: ${naturalList(actionKeys)}` : ""}`,
    })
  }
}
