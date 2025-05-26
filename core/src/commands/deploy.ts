/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import deline from "deline"
import dedent from "dedent"

import type { CommandParams, CommandResult, PrepareParams, ProcessCommandResult } from "./base.js"
import { Command, handleProcessResults, processCommandResultSchema, emptyActionResults } from "./base.js"
import { printEmoji, printHeader } from "../logger/util.js"
import { runAsDevCommand } from "./helpers.js"
import { DeployTask } from "../tasks/deploy.js"
import { naturalList } from "../util/string.js"
import { StringsParameter, BooleanParameter } from "../cli/params.js"
import type { Garden } from "../garden.js"
import type { ActionModeMap } from "../actions/types.js"
import { SyncMonitor } from "../monitors/sync.js"
import { warnOnLinkedActions } from "../actions/helpers.js"
import { PluginEventBroker } from "../plugin-context.js"
import { HandlerMonitor } from "../monitors/handler.js"
import { PortForwardMonitor } from "../monitors/port-forward.js"
import { LogMonitor } from "../monitors/logs.js"
import { parseLogLevel } from "../logger/logger.js"
import { serveOpts } from "./serve.js"
import { gardenEnv } from "../constants.js"
import type { DeployAction } from "../actions/deploy.js"
import { watchParameter, watchRemovedWarning } from "./util/watch-parameter.js"
import { styles } from "../logger/styles.js"

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
  "force": new BooleanParameter({ help: "Force re-deploy.", aliases: ["f"] }),
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
  "skip": new StringsParameter({
    help: "The name(s) of Deploys you'd like to skip.",
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
  "skip-dependencies": new BooleanParameter({
    help: deline`
    Skip deploy, test and run dependencies. Build dependencies and runtime output reference dependencies are not skipped.
    This can be useful e.g. when your stack has already been deployed, and you want to run specific Deploys in sync mode without deploying or running dependencies that may have changed since you last deployed.
    `,
    aliases: ["nodeps"],
  }),
  "with-dependants": new BooleanParameter({
    help: deline`
    Additionally deploy all deploy actions that are downstream dependants of the action(s) being deployed.
    This can be useful when you know you need to redeploy dependants.
    `,
  }),
  "disable-port-forwards": new BooleanParameter({
    help: "Disable automatic port forwarding when running persistently. Note that you can also set GARDEN_DISABLE_PORT_FORWARDS=true in your environment.",
  }),
  "forward": new BooleanParameter({
    help: `Create port forwards and leave process running after deploying. This is implied if any of --sync / --local or --logs are set.`,
  }),
  "logs": new BooleanParameter({
    help: `Stream logs from the requested Deploy(s) (or services if using modules) during deployment, and leave the log streaming process running after deploying. Note: This option implies the --forward option.`,
  }),
  "timestamps": new BooleanParameter({
    help: "Show timestamps with log output. Should be used with the `--logs` option (has no effect if that option is not used).",
  }),
  "skip-watch": new BooleanParameter({
    help: "(keeping for backwards compatibility with 0.12.x)",
    hidden: true,
  }),
  ...serveOpts,
}

type Args = typeof deployArgs
type Opts = typeof deployOpts

export class DeployCommand extends Command<Args, Opts> {
  name = "deploy"
  help = "Deploy actions to your environment."

  override protected = true
  override streamEvents = true

  override description = dedent`
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
        garden deploy my-deploy --logs     # deploy my-deploy and follow the log output from the deployed service
        garden deploy my-deploy -l 3       # deploy with verbose log level to see logs of the creation of the deployment
  `

  override arguments = deployArgs
  override options = deployOpts

  private garden?: Garden

  override outputsSchema = () => processCommandResultSchema()

  override maybePersistent({ opts }: PrepareParams<Args, Opts>) {
    return !!opts["sync"] || !!opts.forward || !!opts.logs
  }

  override printHeader({ log }) {
    printHeader(log, "Deploy", "🚀")
  }

  override useInkTerminalWriter(params) {
    return this.maybePersistent(params)
  }

  override terminate() {
    super.terminate()
    this.garden?.events.emit("_exit", {})
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<ProcessCommandResult>> {
    const { garden, log, args, opts } = params

    this.garden = garden
    const commandLog = log.createLog({ name: "garden" })

    if (opts.watch) {
      await watchRemovedWarning(garden, log)
    }

    const monitor = this.maybePersistent(params)
    if (monitor && !params.parentCommand) {
      // Then we're not in the dev command yet, so we call that instead with the appropriate initial command.
      return runAsDevCommand("deploy", params)
    }

    const disablePortForwards = gardenEnv.GARDEN_DISABLE_PORT_FORWARDS || opts["disable-port-forwards"] || false

    // TODO-0.13.0: make these both explicit options
    const forward = monitor && !disablePortForwards
    const streamLogs = opts.logs

    const actionModes: ActionModeMap = {
      // Support a single empty value (which comes across as an empty list) as equivalent to '*'
      sync: opts.sync?.length === 0 ? ["deploy.*"] : opts.sync?.map((s) => "deploy." + s),
    }

    let actionsFilter: string[] | undefined = undefined

    // TODO: Optimize partial module resolution further when --skip-dependencies=true
    // TODO: Optimize partial resolution further with --skip flag
    // TODO: Support partial module resolution with --with-dependants
    if (args.names && !opts["with-dependants"]) {
      actionsFilter = args.names.map((name) => `deploy.${name}`)
    }

    const graph = await garden.getConfigGraph({ log, emit: true, actionModes, actionsFilter })
    const getDeploysParams = gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION
      ? { includeNames: args.names, includeDisabled: true }
      : { names: args.names, includeDisabled: true }
    let deployActions = graph.getDeploys(getDeploysParams)

    const disabled = deployActions.filter((s) => s.isDisabled()).map((s) => s.name)

    if (disabled.length > 0) {
      const highlight = disabled.map((d) => styles.highlight(d))
      const msg =
        disabled.length === 1
          ? `Deploy action ${highlight} is disabled`
          : `Deploy actions ${naturalList(highlight)} are disabled`
      commandLog.info(msg)
    }

    const skipRuntimeDependencies = opts["skip-dependencies"]
    const withDependants = opts["with-dependants"]
    if (withDependants && args.names && args.names.length > 0) {
      const result = graph.getDependantsForMany({
        kind: "Deploy",
        names: deployActions.map((a) => a.name),
        recursive: true,
        filter: (a) => a.kind === "Deploy",
      }) as DeployAction[]
      deployActions.push(...result)
    }

    const skipped = opts.skip || []

    deployActions = deployActions.filter((s) => !s.isDisabled() && !skipped.includes(s.name))

    if (deployActions.length === 0) {
      commandLog.error({ msg: "Nothing to deploy. Aborting." })
      return { result: { aborted: true, success: true, ...emptyActionResults } }
    }

    const force = opts.force
    const startSync = !!opts.sync

    await warnOnLinkedActions(garden, log, deployActions)

    if (streamLogs) {
      const resolved = await garden.resolveActions({ actions: deployActions, graph, log })
      for (const action of Object.values(resolved)) {
        const logMonitor = new LogMonitor({
          garden,
          log,
          action,
          graph,
          collect: false,
          hideService: false,
          showTags: false,
          msgPrefix: printEmoji("▶", log),
          logLevel: parseLogLevel(opts["log-level"]),
          tagFilters: undefined,
          showTimestamps: opts["timestamps"],
          since: "1m",
        })
        garden.monitors.addAndSubscribe(logMonitor, this)
      }
    }

    const tasks = deployActions.map((action) => {
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

          if (forward) {
            // Start port forwards for ready deployments
            const portForwardMonitor = new PortForwardMonitor({
              garden,
              log,
              graph,
              action: executedAction,
            })
            garden.monitors.addAndSubscribe(portForwardMonitor, this)
          }

          if (mode === "sync") {
            const syncMonitor = new SyncMonitor({
              garden,
              log,
              action: executedAction,
              graph,
              stopOnExit: true, // On this code path, we're running inside the `dev` command.
            })
            garden.monitors.addAndSubscribe(syncMonitor, this)
          } else if (result.attached) {
            // Wait for other attached processes after deployment.
            // Note: No plugin currently does this outside of local mode but we do support it.
            const handlerMonitor = new HandlerMonitor({
              type: "deploy",
              garden,
              log,
              events,
              key: action.key(),
              description: "monitor for attached process in " + action.longDescription(),
            })
            garden.monitors.addAndSubscribe(handlerMonitor, this)
          }
        })
      }
      return task
    })

    const results = await garden.processTasks({ tasks })

    return handleProcessResults(garden, log, "deploy", results)
  }
}
