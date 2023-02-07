/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PrepareParams } from "./base"
import { Command, CommandResult, CommandParams } from "./base"
import { GardenServer, startServer } from "../server/server"
import { Parameters, IntegerParameter } from "../cli/params"
import { printHeader } from "../logger/util"
import { Garden } from "../garden"
import { dedent } from "../util/string"

export const defaultServerPort = 9700

export const serveArgs: Parameters = {}

export const serveOpts = {
  port: new IntegerParameter({
    help: `The port number for the server to listen on.`,
    defaultValue: defaultServerPort,
  }),
}

export type ServeCommandArgs = typeof serveArgs
export type ServeCommandOpts = typeof serveOpts

export class ServeCommand<
  A extends ServeCommandArgs = ServeCommandArgs,
  O extends ServeCommandOpts = ServeCommandOpts,
  R = any
> extends Command<A, O, R> {
  name = "serve"
  aliases = ["dashboard"]
  help = "Starts the Garden Core API server for the current project and environment."

  cliOnly = true
  streamEvents = true
  hidden = true

  public server?: GardenServer
  protected garden?: Garden

  description = dedent`
    Starts the Garden Core API server for the current project, and your selected environment+namespace.

    Note: You must currently run one server per environment and namespace.
  `

  arguments = <A>serveArgs
  options = <O>serveOpts

  printHeader({ headerLog }) {
    printHeader(headerLog, "Server", "bar_chart")
  }

  terminate() {
    this.garden?.events.emit("_exit", {})
    this.server?.close().catch(() => {})
  }

  isPersistent() {
    return true
  }

  async prepare({ log, footerLog, opts }: PrepareParams<ServeCommandArgs, ServeCommandOpts>) {
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

  async action({ garden }: CommandParams<A, O>): Promise<CommandResult<R>> {
    this.garden = garden

    const server = this.server!
    server.setGarden(garden)

    return new Promise((resolve) => {
      server.on("close", () => {
        resolve({})
      })
    })
  }
}
