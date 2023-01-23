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
import { processActions } from "../process"

export const defaultServerPort = 9700

const serveArgs = {}

const serveOpts = {
  port: new IntegerParameter({
    help: `The port number for the server to listen on.`,
    defaultValue: defaultServerPort,
  }),
}

type Args = typeof serveArgs
type Opts = typeof serveOpts

export class ServeCommand extends Command<Args, Opts> {
  name = "serve"
  aliases = ["dashboard"]
  help = "Starts the Garden Core API server for the current project and environment."

  cliOnly = true
  streamEvents = true
  hidden = true
  private garden?: Garden

  description = dedent`
    Starts the Garden Core API servier for the current project, and your selected environment+namespace.

    Note: You must currently run one server per environment and namespace.
  `

  arguments = serveArgs
  options = serveOpts

  printHeader({ headerLog }) {
    printHeader(headerLog, "Server", "bar_chart")
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
          Port ${opts.port} is already in use, possibly by another Garden server process.
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
    const allDeployActions = graph.getActionsByKind("Deploy")

    await processActions({
      garden,
      graph,
      log,
      footerLog,
      watch: true,
      actions: [],
      initialTasks: [],
      skipWatch: allDeployActions,
      skipWatchModules: allModules,
      changeHandler: async () => [],
    })

    return {}
  }
}
