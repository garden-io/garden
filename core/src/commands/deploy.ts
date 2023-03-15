/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
import { processActions } from "../process"
import { printHeader } from "../logger/util"
import { watchParameter, watchRemovedWarning } from "./helpers"
import { DeployTask } from "../tasks/deploy"
import { naturalList } from "../util/string"
import { StringsParameter, BooleanParameter } from "../cli/params"
import { Garden } from "../garden"
import Bluebird = require("bluebird")
import { ActionModeMap } from "../actions/types"

export const deployArgs = {
  names: new StringsParameter({
    help: deline`The name(s) of the deploy(s) (or deploys if using modules) to deploy (skip to deploy everything).
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
    help: deline`The name(s) of the deploys to deploy with sync enabled.
      You may specify multiple names by setting this flag multiple times. Use * to deploy all
      supported deployments with sync enabled.
    `,
    aliases: ["dev", "dev-mode"],
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
  "local-mode": new StringsParameter({
    help: deline`[EXPERIMENTAL] The name(s) of the deploy(s) to be started locally with local mode enabled.
    You may specify multiple deploys by setting this flag multiple times. Use * to deploy all
    deploys with local mode enabled. When this option is used,
    the command is run in persistent mode.

    This always takes the precedence over sync mode if there are any conflicts,
    i.e. if the same deploys are passed to both \`--sync\` and \`--local\` options.
    `,
    aliases: ["local"],
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
  "skip": new StringsParameter({
    help: "The name(s) of deploys you'd like to skip.",
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
  "skip-dependencies": new BooleanParameter({
    help: deline`
    Deploy the specified actions, but don't build, deploy or run any dependencies. This option can only be used when a list of Deploy names is passed as CLI arguments.
    This can be useful e.g. when your stack has already been deployed, and you want to run specific deploys in sync mode without building, deploying or running dependencies that may have changed since you last deployed.
    `,
    aliases: ["nodeps"],
  }),
  "forward": new BooleanParameter({
    help: `Create port forwards and leave process running without watching for changes. This is unnecessary and ignored if any of --sync or --local/--local-mode are set.`,
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
        garden deploy --sync=my-deploy     # deploys all deploys, with sync enabled for my-deploy
        garden deploy --sync               # deploys all compatible deploys with sync enabled
        garden deploy --local=my-deploy    # deploys all deploys, with local mode enabled for my-deploy
        garden deploy --local              # deploys all compatible deploys with local mode enabled
        garden deploy --env stage          # deploy your deploys to an environment called stage
        garden deploy --skip deploy-b      # deploy everything except deploy-b
        garden deploy --forward            # deploy everything and start port forwards without watching for changes
  `

  arguments = deployArgs
  options = deployOpts

  private garden?: Garden

  outputsSchema = () => processCommandResultSchema()

  isPersistent({ opts }: PrepareParams<Args, Opts>) {
    return !!opts["sync"] || !!opts["local-mode"] || !!opts.forward
  }

  printHeader({ headerLog }) {
    printHeader(headerLog, "Deploy", "🚀")
  }

  terminate() {
    this.garden?.events.emit("_exit", {})
  }

  async action(params: CommandParams<Args, Opts>): Promise<CommandResult<ProcessCommandResult>> {
    const { garden, log, footerLog, args, opts } = params

    this.garden = garden

    if (opts.watch) {
      await watchRemovedWarning(garden, log)
    }

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
      log.info({ symbol: "info", msg: chalk.white(msg) })
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

    const initialTasks = actions.map(
      (action) =>
        new DeployTask({
          garden,
          log,
          graph,
          action,
          force,
          forceBuild: opts["force-build"],
          skipRuntimeDependencies,
        })
    )

    const results = await processActions({
      garden,
      graph,
      log,
      actions,
      initialTasks,
      persistent: this.isPersistent(params),
    })

    return handleProcessResults(footerLog, "deploy", results)
  }
}
