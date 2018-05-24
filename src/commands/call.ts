/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "url"
import Axios from "axios"
import chalk from "chalk"
import { isObject } from "util"
import { Command, ParameterValues, StringParameter } from "./base"
import { splitFirst } from "../util"
import { ParameterError, RuntimeError } from "../exceptions"
import { EntryStyle } from "../logger/types"
import { pick } from "lodash"
import { PluginContext } from "../plugin-context"

export const callArgs = {
  serviceAndPath: new StringParameter({
    help: "The name of the service(s) to call followed by the endpoint path (e.g. my-container/somepath)",
    required: true,
  }),
}

export type Args = ParameterValues<typeof callArgs>

export class CallCommand extends Command<typeof callArgs> {
  name = "call"
  help = "Call a service endpoint"

  arguments = callArgs

  async action(ctx: PluginContext, args: Args) {
    let [serviceName, path] = splitFirst(args.serviceAndPath, "/")
    path = "/" + path

    // TODO: better error when service doesn't exist
    const service = await ctx.getService(serviceName)
    const status = await ctx.getServiceStatus({ serviceName })

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
      entry.setSuccess()
      ctx.log.info(chalk.green(`\n${res.status} ${res.statusText}\n`))
    } catch (err) {
      res = err.response
      entry.setError()
      ctx.log.info(chalk.red(`\n${res.status} ${res.statusText}\n`))
    }

    const resStr = isObject(res.data) ? JSON.stringify(res.data, null, 2) : res.data

    res.data && ctx.log.info(chalk.white(resStr))

    return {
      result: {
        serviceName,
        path,
        url,
        response: pick(res, ["status", "statusText", "headers", "data"]),
      },
    }
  }
}
