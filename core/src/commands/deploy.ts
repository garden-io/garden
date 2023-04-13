/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import deline = require("deline")
import dedent = require("dedent")
import chalk = require("chalk")

import {
  Command,
  CommandParams,
  CommandResult,
  handleProcessResults,
  PrepareParams,
  processCommandResultSchema,
  ProcessCommandResult,
} from "./base"
import { printEmoji, printHeader } from "../logger/util"
import { watchParameter, watchRemovedWarning } from "./helpers"
import { DeployTask, isDeployTask } from "../tasks/deploy"
import { naturalList } from "../util/string"
import { StringsParameter, BooleanParameter } from "../cli/params"
import { Garden } from "../garden"
import { ActionModeMap } from "../actions/types"
import { SyncMonitor } from "../monitors/sync"
import { warnOnLinkedActions } from "../actions/helpers"
import { PluginEventBroker } from "../plugin-context"
import { HandlerMonitor } from "../monitors/handler"
import { GraphResultFromTask } from "../graph/results"
import { PortForwardMonitor } from "../monitors/port-forward"
import { registerCleanupFunction } from "../util/util"

export const deployArgs = {
  names: new StringsParameter({
    help: deline`The name(s) of the Deploy(s) (or services if using modules) to deploy (skip to deploy everything).
      You may specify multiple names, separated by spaces.`,
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
}

export const deployOpts = {
  "force": new BooleanParameter({ help: "Force re-deploy." }),
  "force-build": new BooleanParameter({ help: "Force re-build of build dependencies." }),
  "watch": watchParameter,
  "sync": new StringsParameter({
    help: dedent`
      The name(s) of the Deploy(s) to deploy with sync enabled.
      You may specify multiple names by setting this flag multiple times.
      Use * to deploy all supported deployments with sync enabled.

      Important: The syncs stay active after the command exits. To stop the syncs, use the \`sync stop\` command.
    `,
    aliases: ["dev", "dev-mode"],
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
  "local-mode": new StringsParameter({
    help: dedent`
    [EXPERIMENTAL] The name(s) of Deploy(s) to be started locally with local mode enabled.

    You may specify multiple Deploys by setting this flag multiple times. Use * to deploy all Deploys with local mode enabled. When this option is used,
    the command stays running until explicitly aborted.

    This always takes the precedence over sync mode if there are any conflicts, i.e. if the same Deploys are matched with both \`--sync\` and \`--local\` options.
    `,
    aliases: ["local"],
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
  "skip": new StringsParameter({
    help: "The name(s) of Deploys you'd like to skip.",
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
  "skip-dependencies": new BooleanParameter({
    help: deline`
    Deploy the specified actions, but don't build, deploy or run any dependencies. This option can only be used when a list of Deploy names is passed as CLI arguments.
    This can be useful e.g. when your stack has already been deployed, and you want to run specific Deploys in sync mode without building, deploying or running dependencies that may have changed since you last deployed.
    `,
    aliases: ["nodeps"],
  }),
  "forward": new BooleanParameter({
    help: `Create port forwards and leave process running after deploying. This is implied if any of --sync or --local/--local-mode are set.`,
  }),
}

type Args = typeof deployArgs
type Opts = typeof deployOpts

export class DeployCommand extends Command<Args, Opts> {
  name = "deploy"
  help = "Deploy actions to your environment."

  protected = true
  streamEvents = true

  description = dedent`
    Deploys all or specified Deploy actions, taking into account dependency order.
    Also performs builds and other dependencies if needed.

    Optionally stays running and automatically re-builds and re-deploys if sources
    (or dependencies' sources) change.

    Examples:

        garden deploy                      # deploy everything in the project
        garden deploy my-deploy            # only deploy my-deploy
        garden deploy deploy-a,deploy-b    # only deploy deploy-a and deploy-b
        garden deploy --force              # force re-deploy, even for deploys already deployed and up-to-date
        garden deploy --sync=my-deploy     # deploys all Deploys, with sync enabled for my-deploy
        garden deploy --sync               # deploys all compatible Deploys with sync enabled
        garden deploy --local=my-deploy    # deploys all Deploys, with local mode enabled for my-deploy
        garden deploy --local              # deploys all compatible Deploys with local mode enabled
        garden deploy --env stage          # deploy your Deploys to an environment called stage
        garden deploy --skip deploy-b      # deploy everything except deploy-b
        garden deploy --forward            # deploy everything and start port forwards without sync or local mode
  `

  arguments = deployArgs
  options = deployOpts

  private garden?: Garden

  outputsSchema = () => processCommandResultSchema()

  maybePersistent({ opts }: PrepareParams<Args, Opts>) {
    return !!opts["sync"] || !!opts["local-mode"] || !!opts.forward
  }

  printHeader({ headerLog }) {
    printHeader(headerLog, "Deploy", "🚀")
  }

  terminate() {
    super.terminate()
    this.garden?.events.emit("_exit", {})
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<ProcessCommandResult>> {
    const { garden, log, footerLog, args, opts } = params

    this.garden = garden

    if (opts.watch) {
      await watchRemovedWarning(garden, log)
    }

    // TODO-0.13.0: make these both explicit options
    let monitor = this.maybePersistent(params)
    let forward = monitor

    const actionModes: ActionModeMap = {
      // Support a single empty value (which comes across as an empty list) as equivalent to '*'
      local: opts["local-mode"]?.length === 0 ? ["*"] : opts["local-mode"]?.map((s) => "deploy." + s),
      sync: opts.sync?.length === 0 ? ["*"] : opts.sync?.map((s) => "deploy." + s),
    }

    const graph = await garden.getConfigGraph({ log, emit: true, actionModes })
    let actions = graph.getDeploys({ names: args.names, includeDisabled: true })

    const disabled = actions.filter((s) => s.isDisabled()).map((s) => s.name)

    if (disabled.length > 0) {
      const bold = disabled.map((d) => chalk.bold(d))
      const msg =
        disabled.length === 1 ? `Deploy action ${bold} is disabled` : `Deploy actions ${naturalList(bold)} are disabled`
      log.info(chalk.white(msg))
    }

    const skipped = opts.skip || []

    actions = actions.filter((s) => !s.isDisabled() && !skipped.includes(s.name))

    if (actions.length === 0) {
      log.error({ msg: "Nothing to deploy. Aborting." })
      return { result: { aborted: true, success: true, graphResults: {} } }
    }

    const skipRuntimeDependencies = opts["skip-dependencies"]
    if (skipRuntimeDependencies && (!args.names || args.names.length === 0)) {
      const errMsg = deline`
        No names were provided as CLI arguments, but the --skip-dependencies option was used. Please provide a
        list of names when using the --skip-dependencies option.
      `
      log.error({ msg: errMsg })
      return { result: { aborted: true, success: false, graphResults: {} } }
    }

    const force = opts.force
    const startSync = !!opts.sync

    await warnOnLinkedActions(garden, log, actions)

    if (forward) {
      // Start port forwards for ready deployments
      garden.events.on("taskReady", (graphResult) => {
        const { task } = graphResult
        const typedResult = graphResult as GraphResultFromTask<DeployTask>

        if (!isDeployTask(task) || !graphResult.result) {
          return
        }

        const action = typedResult.result!.executedAction

        garden.monitors.add(
          new PortForwardMonitor({
            garden,
            log,
            graph,
            action,
            command: this,
          })
        )
      })
    }

    let syncAlerted = false

    function syncWarnings() {
      if (syncAlerted) {
        return
      }
      const commandSuggestion = `To stop syncing, use the ${chalk.whiteBright("sync stop")} command.`
      garden
        .emitWarning({
          log,
          key: "syncs-stay-active",
          message: chalk.white(`Please note: Syncs stay active after the Garden process ends. ${commandSuggestion}`),
        })
        .catch(() => {})

      registerCleanupFunction("sync-active-alert", () => {
        // eslint-disable-next-line no-console
        log.info(
          "\n" +
            printEmoji("ℹ️", log) +
            chalk.white(`One or more syncs may still be active. ${commandSuggestion}\n\n`) +
            chalk.green("Done!")
        )
      })

      syncAlerted = true
    }

    const tasks = actions.map((action) => {
      const events = new PluginEventBroker(garden)
      const task = new DeployTask({
        garden,
        log,
        graph,
        action,
        force,
        forceBuild: opts["force-build"],
        skipRuntimeDependencies,
        startSync,
        events,
      })
      if (monitor) {
        task.on("ready", ({ result }) => {
          const executedAction = result?.executedAction
          const mode = executedAction.mode()

          if (mode === "sync") {
            garden.monitors.add(
              new SyncMonitor({
                garden,
                log,
                command: this,
                action: executedAction,
                graph,
              })
            )
            syncWarnings()
          } else if (mode === "local" && result.attached) {
            // Wait for local mode processes to complete.
            garden.monitors.add(
              new HandlerMonitor({
                type: "local-deploy",
                garden,
                log,
                command: this,
                events,
                key: action.key(),
                description: "monitor for attached local mode process in " + action.longDescription(),
              })
            )
          } else if (result.attached) {
            // Wait for other attached processes after deployment.
            // Note: No plugin currently does this outside of local mode but we do support it.
            garden.monitors.add(
              new HandlerMonitor({
                type: "deploy",
                garden,
                log,
                command: this,
                events,
                key: action.key(),
                description: "monitor for attached process in " + action.longDescription(),
              })
            )
          }
        })
      }
      return task
    })

    const results = await garden.processTasks({ tasks, log })

    return handleProcessResults(garden, footerLog, "deploy", results)
  }
}
