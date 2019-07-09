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
import {
  Command,
  CommandResult,
  CommandParams,
  StringParameter,
} from "./base"
import { splitFirst } from "../util/util"
import { ParameterError, RuntimeError } from "../exceptions"
import { find, includes, pick } from "lodash"
import { ServiceIngress, getIngressUrl, getServiceRuntimeContext } from "../types/service"
import dedent = require("dedent")
import { printHeader } from "../logger/util"

const callArgs = {
  serviceAndPath: new StringParameter({
    help: "The name of the service to call followed by the ingress path (e.g. my-container/somepath).",
    required: true,
  }),
}

type Args = typeof callArgs

export class CallCommand extends Command<Args> {
  name = "call"
  help = "Call a service ingress endpoint."

  description = dedent`
    Resolves the deployed ingress endpoint for the given service and path, calls the given endpoint and
    outputs the result.

    Examples:

        garden call my-container
        garden call my-container/some-path

    Note: Currently only supports simple GET requests for HTTP/HTTPS ingresses.
  `

  arguments = callArgs

  async action({ garden, log, headerLog, args }: CommandParams<Args>): Promise<CommandResult> {
    printHeader(headerLog, "Call", "telephone_receiver")

    let [serviceName, path] = splitFirst(args.serviceAndPath, "/")

    // TODO: better error when service doesn't exist
    const graph = await garden.getConfigGraph()
    const service = await graph.getService(serviceName)
    const runtimeContext = await getServiceRuntimeContext(garden, graph, service)
    const actions = await garden.getActionHelper()
    const status = await actions.getServiceStatus({ service, log, hotReload: false, runtimeContext })

    if (!includes(["ready", "outdated"], status.state)) {
      throw new RuntimeError(`Service ${service.name} is not running`, {
        serviceName: service.name,
        status,
      })
    }

    if (!status.ingresses || status.ingresses.length === 0) {
      throw new ParameterError(`Service ${service.name} has no active ingresses`, {
        serviceName: service.name,
        serviceStatus: status,
      })
    }

    // find the correct endpoint to call
    let matchedIngress: ServiceIngress | null = null
    let matchedPath

    // we can't easily support raw TCP or UDP in a command like this
    const ingresses = status.ingresses.filter(e => e.protocol === "http" || e.protocol === "https")

    if (!path) {
      // if no path is specified and there's a root endpoint (path === "/") we use that
      const rootIngress = <ServiceIngress>find(ingresses, e => e.path === "/")

      if (rootIngress) {
        matchedIngress = rootIngress
        matchedPath = "/"
      } else {
        // if there's no root endpoint, pick the first endpoint
        matchedIngress = ingresses[0]
        matchedPath = ingresses[0].path
      }

      path = matchedPath

    } else {
      path = "/" + path

      for (const ingress of status.ingresses) {
        if (ingress.path) {
          if (path.startsWith(ingress.path) && (!matchedPath || ingress.path.length > matchedPath.length)) {
            matchedIngress = ingress
            matchedPath = ingress.path
          }
        } else if (!matchedPath) {
          matchedIngress = ingress
        }
      }
    }

    if (!matchedIngress) {
      throw new ParameterError(`Service ${service.name} does not have an HTTP/HTTPS ingress at ${path}`, {
        serviceName: service.name,
        path,
        availableIngresses: status.ingresses,
      })
    }

    const url = resolve(getIngressUrl(matchedIngress), path || matchedPath)
    // TODO: support POST requests with request body
    const method = "get"

    const entry = log.info({
      msg: chalk.cyan(`Sending ${matchedIngress.protocol.toUpperCase()} GET request to `) + url + "\n",
      status: "active",
    })

    // this is to accept self-signed certs
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

    const req = Axios({
      method,
      url,
      headers: {
        host: matchedIngress.hostname,
      },
    })

    // TODO: add verbose and debug logging (request/response headers etc.)
    let res

    try {
      res = await req
      entry.setSuccess()
      log.info(chalk.green(`${res.status} ${res.statusText}\n`))
    } catch (err) {
      res = err.response
      entry.setError()
      const error = res ? `${res.status} ${res.statusText}` : err.message
      log.info(chalk.red(error + "\n"))
      return {}
    }

    const resStr = isObject(res.data) ? JSON.stringify(res.data, null, 2) : res.data

    res.data && log.info(chalk.white(resStr))

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
