/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { parse, resolve } from "url"
import chalk from "chalk"
import { getStatusText } from "http-status-codes"
import { Command, CommandResult, CommandParams } from "./base"
import { splitFirst } from "../util/util"
import { ParameterError, RuntimeError } from "../exceptions"
import { find, includes } from "lodash"
import { ServiceIngress, getIngressUrl } from "../types/service"
import { dedent } from "../util/string"
import { printHeader } from "../logger/util"
import { emptyRuntimeContext } from "../runtime-context"
import { got, GotResponse } from "../util/http"
import { StringParameter } from "../cli/params"
import { emitStackGraphEvent } from "./helpers"

const callArgs = {
  serviceAndPath: new StringParameter({
    help: "The name of the service to call followed by the ingress path (e.g. my-container/somepath).",
    required: true,
  }),
}

type Args = typeof callArgs

interface CallResult {
  serviceName: string
  path: string
  url: string
  response: {
    status: number
    statusText: string
    headers: GotResponse["headers"] | null
    data: string | object | null
    error: string | null
  }
}

export class CallCommand extends Command<Args> {
  name = "call"
  help = "Call a service ingress endpoint."

  streamEvents = true

  description = dedent`
    Resolves the deployed ingress endpoint for the given service and path, calls the given endpoint and
    outputs the result.

    Examples:

        garden call my-container
        garden call my-container/some-path

    Note: Currently only supports simple GET requests for HTTP/HTTPS ingresses.
  `

  arguments = callArgs

  printHeader({ headerLog }) {
    printHeader(headerLog, "Call", "telephone_receiver")
  }

  async action({ garden, isWorkflowStepCommand, log, args }: CommandParams<Args>): Promise<CommandResult<CallResult>> {
    let [serviceName, path] = splitFirst(args.serviceAndPath, "/")

    // TODO: better error when service doesn't exist
    const graph = await garden.getConfigGraph(log)
    if (!isWorkflowStepCommand) {
      emitStackGraphEvent(garden, graph)
    }
    const service = graph.getService(serviceName)
    // No need for full context, since we're just checking if the service is running.
    const runtimeContext = emptyRuntimeContext
    const actions = await garden.getActionRouter()
    const status = await actions.getServiceStatus({ service, log, devMode: false, hotReload: false, runtimeContext })

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
    const ingresses = status.ingresses.filter((e) => e.protocol === "http" || e.protocol === "https")

    if (!path) {
      // if no path is specified and there's a root endpoint (path === "/") we use that
      const rootIngress = <ServiceIngress>find(ingresses, (e) => e.path === "/")

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

    let url: string
    let protocol: string
    let host: string

    // If a link URL is provided, we use that (and destructure the URL parts from it)...
    if (matchedIngress.linkUrl) {
      url = matchedIngress.linkUrl
      const parsed = parse(url)
      protocol = parsed.protocol || ""
      host = parsed.hostname || ""
      // Overwrite the return path value
      path = parsed.path || ""
      // ...otherwise we use the ingress spec
    } else {
      url = resolve(getIngressUrl(matchedIngress), path || matchedPath)
      protocol = matchedIngress.protocol
      host = matchedIngress.hostname
    }

    // TODO: support POST requests with request body
    const method = "get"

    const entry = log.info({
      msg: chalk.cyan(`Sending ${protocol.toUpperCase()} ${method.toUpperCase()} request to `) + url + "\n",
      status: "active",
    })

    // this is to accept self-signed certs
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

    const req = got({
      method,
      url,
      headers: { host },
    })

    // TODO: add verbose and debug logging (request/response headers etc.)
    let res: GotResponse<string>
    let statusText = ""
    let error: string | null = null
    let output: string | object | null = null

    try {
      res = await req
      entry.setSuccess()
      statusText = getStatusText(res.statusCode)
      log.info(chalk.green(`${res.statusCode} ${statusText}\n`))

      output = res.body

      if (res.headers["content-type"] === "application/json") {
        try {
          output = JSON.parse(res.body)
        } catch (err) {
          throw new RuntimeError(`Got content-type=application/json but could not parse output as JSON`, {
            response: res,
          })
        }
      }
    } catch (err) {
      res = err.response
      entry.setError()

      if (res) {
        statusText = getStatusText(res.statusCode)
      }

      error = err.message
      log.info(chalk.red(error + "\n"))
    }

    res && res.body && log.info(chalk.white(res.body))

    return {
      result: {
        serviceName,
        path,
        url,
        response: {
          data: output,
          error,
          headers: res ? res.headers : null,
          status: res ? res.statusCode : 204,
          statusText,
        },
      },
    }
  }
}
