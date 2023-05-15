/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams } from "./base"
import { startServer } from "../server/server"
import { IntegerParameter, StringsParameter } from "../cli/params"
import { printHeader } from "../logger/util"
import { dedent } from "../util/string"
import { CommandLine } from "../cli/command-line"
import { GardenInstanceManager } from "../server/instance-manager"
import chalk from "chalk"
import { sleep } from "../util/util"
import { Log } from "../logger/log-entry"

export const defaultServerPort = 9700

export const serveArgs = {}

export const serveOpts = {
  port: new IntegerParameter({
    help: `The port number for the server to listen on.`,
    defaultValue: defaultServerPort,
  }),
  cmd: new StringsParameter({ help: "(Only used by dev command for now)", hidden: true }),
}

export type ServeCommandArgs = typeof serveArgs
export type ServeCommandOpts = typeof serveOpts

export class ServeCommand<
  A extends ServeCommandArgs = ServeCommandArgs,
  O extends ServeCommandOpts = ServeCommandOpts,
  R = any
> extends Command<A, O, R> {
  name = "serve"
  help = "Starts the Garden Core API server for the current project and environment."

  cliOnly = true
  streamEvents = true
  hidden = true
  noProject = true

  protected _manager?: GardenInstanceManager
  protected commandLine?: CommandLine

  description = dedent`
    Starts the Garden Core API server for the current project, and your selected environment+namespace.

    Note: You must currently run one server per environment and namespace.
  `

  arguments = <A>serveArgs
  options = <O>serveOpts

  printHeader({ log }) {
    printHeader(log, "Garden API Server", "🌐")
  }

  terminate() {
    super.terminate()
    this.server?.close().catch(() => {})
  }

  maybePersistent() {
    return true
  }

  allowInDevCommand() {
    return false
  }

  async action({ log, opts }: CommandParams<ServeCommandArgs, ServeCommandOpts>): Promise<CommandResult<R>> {
    this.server = await startServer({
      log,
      manager: this.getManager(log),
      port: opts.port,
      defaultProjectRoot: process.cwd(),
    })

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
        log.error({ msg: err.message })
      }
      process.exit(1)
    })

    return new Promise((resolve, reject) => {
      this.server!.on("close", () => {
        resolve({})
      })

      this.server!.on("error", () => {
        reject({})
      })

      // Errors are handled in the method
      this.reload(log)
        .then(async () => {
          if (this.commandLine) {
            for (const cmd of opts.cmd || []) {
              await this.commandLine.typeCommand(cmd)
              await sleep(1000)
            }
          }
          this.commandLine?.flashSuccess(chalk.white.bold(`Dev console is ready to go! 🚀`))
          this.commandLine?.enable()
        })
        // Errors are handled in the method
        .catch(() => {})
    })
  }

  getManager(log: Log): GardenInstanceManager {
    if (!this._manager) {
      this._manager = new GardenInstanceManager({ log, serveCommand: this })
    }
    return this._manager
  }

  async reload(log: Log) {
    await this.getManager(log).reload(log)
  }
}
