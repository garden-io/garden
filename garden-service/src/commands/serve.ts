/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import { LoggerType } from "../logger/logger"
import { IntegerParameter } from "./base"
import { Command, CommandResult, CommandParams } from "./base"
import { sleep } from "../util/util"
import { startServer, DEFAULT_PORT } from "../server/server"

const serveArgs = {}

const serveOpts = {
  port: new IntegerParameter({
    help: `The port number for the Garden service to listen on.`,
    defaultValue: DEFAULT_PORT,
  }),
}

type Args = typeof serveArgs
type Opts = typeof serveOpts

export class ServeCommand extends Command<Args, Opts> {
  name = "serve"
  help = "Starts the Garden HTTP API service - **Experimental**"

  cliOnly = true
  loggerType: LoggerType = "basic"

  description = dedent`
    **Experimental**

    Starts an HTTP server that exposes Garden commands and events.
  `

  arguments = serveArgs
  options = serveOpts

  async action({ garden, log, opts }: CommandParams<Args, Opts>): Promise<CommandResult<{}>> {
    await startServer(garden, log, opts.port)

    // The server doesn't block, so we need to loop indefinitely here.
    while (true) {
      await sleep(10000)
    }
  }
}
