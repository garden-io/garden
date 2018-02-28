import { BooleanParameter, Command, EnvironmentOption, ParameterValues, StringParameter } from "./base"
import { GardenContext } from "../context"
import chalk from "chalk"
import { GetServiceLogsParams, ServiceLogEntry } from "../types/plugin"
import Bluebird = require("bluebird")
import { values } from "lodash"
import { Service } from "../types/service"
import Stream from "ts-stream"

const logsArgs = {
  service: new StringParameter({
    help: "The name of the service(s) to logs (skip to logs all services). " +
      "Use comma as separator to specify multiple services.",
  }),
}

const logsOpts = {
  env: new EnvironmentOption(),
  tail: new BooleanParameter({ help: "Continuously stream new logs from the service(s)", alias: "t" }),
  // TODO
  // since: new MomentParameter({ help: "Retrieve logs from the specified point onwards" }),
}

type Args = ParameterValues<typeof logsArgs>
type Opts = ParameterValues<typeof logsOpts>

export class LogsCommand extends Command<typeof logsArgs, typeof logsOpts> {
  name = "logs"
  help = "Retrieves the most recent logs for the specified service(s)"

  arguments = logsArgs
  options = logsOpts

  async action(ctx: GardenContext, args: Args, opts: Opts) {
    opts.env && ctx.setEnvironment(opts.env)
    const env = ctx.getEnvironment()
    const names = args.service ? args.service.split(",") : undefined
    const services = await ctx.getServices(names)

    const result: ServiceLogEntry[] = []
    const stream = new Stream<ServiceLogEntry>()

    // TODO: use basic logger (no need for fancy stuff here, just causes flickering)
    stream.forEach((entry) => {
      // TODO: color each service differently for easier visual parsing
      ctx.log.info({ section: entry.serviceName, msg: [entry.timestamp.toISOString(), chalk.white(entry.msg)] })
    })

    // NOTE: This will work differently when we have Elasticsearch set up for logging, but is
    //       quite servicable for now.
    await Bluebird.map(values(services), async (service: Service<any>) => {
      const handler = ctx.getActionHandler("getServiceLogs", service.module.type, dummyLogStreamer)
      await handler({ ctx, service, env, stream, tail: opts.tail })
    })

    return result
  }
}

async function dummyLogStreamer({ ctx, service }: GetServiceLogsParams) {
  ctx.log.warn({
    section: service.name,
    msg: chalk.yellow(`No handler for log retrieval available for module type ${service.module.type}`),
  })
}
