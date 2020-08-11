/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import { LoggerType } from "../logger/logger"
import { PrepareParams } from "./base"
import { Command, CommandResult, CommandParams } from "./base"
import { sleep } from "../util/util"
import { GardenServer, startServer } from "../server/server"
import { IntegerParameter } from "../cli/params"

const serveArgs = {}

const serveOpts = {
  port: new IntegerParameter({
    help: `The port number for the Garden service to listen on.`,
  }),
}

type Args = typeof serveArgs
type Opts = typeof serveOpts

export class ServeCommand extends Command<Args, Opts> {
  name = "serve"
  help = "Starts the Garden HTTP API service - **Experimental**"

  cliOnly = true

  description = dedent`
    **Experimental**

    Starts an HTTP server that exposes Garden commands and events.
  `

  arguments = serveArgs
  options = serveOpts

  private server: GardenServer

  getLoggerType(): LoggerType {
    return "basic"
  }

  async prepare({ footerLog, opts }: PrepareParams<Args, Opts>) {
    this.server = await startServer(footerLog, opts.port)
    return { persistent: true }
  }

  async action({ garden }: CommandParams<Args, Opts>): Promise<CommandResult<{}>> {
    this.server.setGarden(garden)

    // The server doesn't block, so we need to loop indefinitely here.
    while (true) {
      await sleep(10000)
    }
  }
}
