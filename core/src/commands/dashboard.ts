/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import { PrepareParams } from "./base"
import { Command, CommandResult, CommandParams } from "./base"
import { startServer } from "../server/server"
import { IntegerParameter } from "../cli/params"
import { printHeader } from "../logger/util"
import chalk = require("chalk")
import { Garden } from "../garden"

export const defaultDashboardPort = 9700

const dashboardArgs = {}

const dashboardOpts = {
  port: new IntegerParameter({
    help: `The port number for the Garden dashboard to listen on.`,
    defaultValue: defaultDashboardPort,
  }),
}

type Args = typeof dashboardArgs
type Opts = typeof dashboardOpts

export class DashboardCommand extends Command<Args, Opts> {
  name = "dashboard"
  aliases = ["serve"]
  help = "Starts the Garden dashboard for the current project and environment."

  cliOnly = true
  streamEvents = true
  private garden?: Garden

  description = dedent`
    Starts the Garden dashboard for the current project, and your selected environment+namespace. The dashboard can be used to monitor your Garden project, look at logs, provider-specific dashboard pages and more.

    The dashboard will receive and display updates from other Garden processes that you run with the same Garden project, environment and namespace.

    Note: You must currently run one dashboard per-environment and namespace.
  `

  arguments = dashboardArgs
  options = dashboardOpts

  printHeader({ headerLog }) {
    printHeader(headerLog, "Dashboard", "bar_chart")
  }

  terminate() {
    this.garden?.events.emit("_exit", {})
  }

  isPersistent() {
    return true
  }

  async prepare({ log, footerLog, opts }: PrepareParams<Args, Opts>) {
    this.server = await startServer({ log: footerLog, port: opts.port })

    // Print nicer error message when address is not available
    process.on("uncaughtException", (err: any) => {
      if (err.errno === "EADDRINUSE" && err.port === opts.port) {
        log.error({
          msg: dedent`
          Port ${opts.port} is already in use, possibly by another dashboard process.
          Either terminate the other process, or choose another port using the --port parameter.
          `,
        })
      } else {
        footerLog.error({ msg: err.message })
      }
      process.exit(1)
    })
  }

  async action({ garden, log, footerLog }: CommandParams<Args, Opts>): Promise<CommandResult<{}>> {
    log.info(
      chalk.gray(
        `Connected to environment ${chalk.white.bold(garden.namespace)}.${chalk.white.bold(garden.environmentName)}`
      )
    )

    this.garden = garden
    const graph = await garden.getConfigGraph({ log, emit: true })
    this.server!.setGarden(garden)
    const allModules = graph.getModules()
    await processModules({
      garden,
      graph,
      log,
      footerLog,
      modules: allModules,
      watch: true,
      initialTasks: [],
      skipWatchModules: allModules,
      changeHandler: async () => [],
      overRideWatchStatusLine: "Dashboard running...",
    })

    return {}
  }
}
