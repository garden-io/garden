/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  BooleanParameter,
  Command,
  CommandResult,
  CommandParams,
  StringsParameter,
} from "./base"
import chalk from "chalk"
import { ServiceLogEntry } from "../types/plugin/outputs"
import Bluebird = require("bluebird")
import { Service } from "../types/service"
import Stream from "ts-stream"
import { LoggerType } from "../logger/types"
import dedent = require("dedent")

const logsArgs = {
  service: new StringsParameter({
    help: "The name of the service(s) to logs (skip to logs all services). " +
      "Use comma as separator to specify multiple services.",
  }),
}

const logsOpts = {
  tail: new BooleanParameter({ help: "Continuously stream new logs from the service(s).", alias: "t" }),
  // TODO
  // since: new MomentParameter({ help: "Retrieve logs from the specified point onwards" }),
}

type Args = typeof logsArgs
type Opts = typeof logsOpts

export class LogsCommand extends Command<Args, Opts> {
  name = "logs"
  help = "Retrieves the most recent logs for the specified service(s)."

  description = dedent`
    Outputs logs for all or specified services, and optionally waits for news logs to come in.

    Examples:

        garden logs               # prints latest logs from all services
        garden logs my-service    # prints latest logs for my-service
        garden logs -t            # keeps running and streams all incoming logs to the console
  `

  arguments = logsArgs
  options = logsOpts
  loggerType = LoggerType.basic

  async action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<ServiceLogEntry[]>> {
    const tail = opts.tail
    const services = await garden.getServices(args.service)

    const result: ServiceLogEntry[] = []
    const stream = new Stream<ServiceLogEntry>()

    // TODO: use basic logger (no need for fancy stuff here, just causes flickering)
    stream.forEach((entry) => {
      // TODO: color each service differently for easier visual parsing
      let timestamp = "                        "

      // bad timestamp values can cause crash if not caught
      if (entry.timestamp) {
        try {
          timestamp = entry.timestamp.toISOString()
        } catch { }
      }

      garden.log.info({
        section: entry.serviceName,
        msg: [timestamp, chalk.white(entry.msg)],
      })

      if (!tail) {
        result.push(entry)
      }
    })

    // NOTE: This will work differently when we have Elasticsearch set up for logging, but is
    //       quite servicable for now.
    await Bluebird.map(services, async (service: Service<any>) => {
      await garden.actions.getServiceLogs({ service, stream, tail })
    })

    return { result }
  }
}
