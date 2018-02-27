import { resolve } from "url"
import Axios from "axios"
import chalk from "chalk"
import { Command, EnvironmentOption, ParameterValues, StringParameter } from "./base"
import { GardenContext } from "../context"
import { splitFirst } from "../util"
import { ParameterError, RuntimeError } from "../exceptions"
import { EntryStyle } from "../logger/types"
import { pick } from "lodash"

const callArgs = {
  serviceAndPath: new StringParameter({
    help: "The name of the service(s) to call followed by the endpoint path (e.g. my-container/somepath)",
    required: true,
  }),
}

const options = {
  env: new EnvironmentOption({
    help: "The environment (and optionally namespace) to call to",
  }),
}

type Args = ParameterValues<typeof callArgs>
type Opts = ParameterValues<typeof options>

export class CallCommand extends Command<typeof callArgs> {
  name = "call"
  help = "Call a service endpoint"

  arguments = callArgs
  options = options

  async action(ctx: GardenContext, args: Args, opts: Opts) {
    opts.env && ctx.setEnvironment(opts.env)

    let [serviceName, path] = splitFirst(args.serviceAndPath, "/")
    path = "/" + path

    // TODO: better error when service doesn't exist
    const services = await ctx.getServices([serviceName])
    const service = services[serviceName]

    const status = await ctx.getServiceStatus(service)

    if (status.state !== "ready") {
      throw new RuntimeError(`Service ${service.name} is not running`, {
        serviceName: service.name,
        state: status.state,
      })
    }

    if (!status.endpoints) {
      throw new ParameterError(`Service ${service.name} has no active endpoints`, {
        serviceName: service.name,
        serviceStatus: status,
      })
    }

    // find the correct endpoint to call
    let matchedEndpoint
    let matchedPath

    for (const endpoint of status.endpoints) {
      // we can't easily support raw TCP or UDP in a command like this
      if (endpoint.protocol !== "http" && endpoint.protocol !== "https") {
        continue
      }

      if (endpoint.paths) {
        for (const endpointPath of endpoint.paths) {
          if (path.startsWith(endpointPath) && (!matchedPath || endpointPath.length > matchedPath.length)) {
            matchedPath = endpointPath
            matchedEndpoint = endpoint
          }
        }
      } else if (!matchedPath) {
        matchedEndpoint = endpoint
      }
    }

    if (!matchedEndpoint) {
      throw new ParameterError(`Service ${service.name} does not have an HTTP/HTTPS endpoint at ${path}`, {
        serviceName: service.name,
        path,
        availableEndpoints: status.endpoints,
      })
    }

    const url = resolve(matchedEndpoint.url, path)
    // TODO: support POST requests with request body
    const method = "get"

    const entry = ctx.log.info({
      msg: chalk.cyan(`Sending HTTP GET request to `) + url,
      entryStyle: EntryStyle.activity,
    })

    const req = Axios({
      method,
      url,
      headers: {
        host: matchedEndpoint.hostname,
      },
    })

    // TODO: add verbose and debug logging (request/response headers etc.)
    let res

    try {
      res = await req
      entry.success()
      ctx.log.info({ msg: chalk.green(`\n${res.status} ${res.statusText}\n`) })
    } catch (err) {
      res = err.response
      entry.error()
      ctx.log.info({ msg: chalk.red(`\n${res.status} ${res.statusText}\n`) })
    }

    res.data && ctx.log.info({ msg: chalk.white(res.data) })

    return {
      serviceName,
      path,
      url,
      response: pick(res, ["status", "statusText", "headers", "data"]),
    }
  }
}
