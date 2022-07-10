/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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

const callArgs = {
  nameAndPath: new StringParameter({
    help: "The name of the deploy/service to call followed by the ingress path (e.g. my-container/somepath).",
    required: true,
  }),
}

type Args = typeof callArgs

interface CallResult {
  deployName: string
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
  help = "Call a deployed ingress endpoint."

  streamEvents = true

  description = dedent`
    Resolves the deployed ingress endpoint for the given deploy/service and path, calls the given endpoint and
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

  async action({ garden, log, args }: CommandParams<Args>): Promise<CommandResult<CallResult>> {
    let [deployName, path] = splitFirst(args.nameAndPath, "/")

    // TODO: better error when deploy doesn't exist
    const graph = await garden.getConfigGraph({ log, emit: true })
    const action = graph.getDeploy(deployName)
    // No need for full context, since we're just checking if the deploy is running.
    const runtimeContext = emptyRuntimeContext
    const router = await garden.getActionRouter()
    const status = await router.deploy.getStatus({
      action,
      log,
      graph,
      devMode: false,
      localMode: false,
      runtimeContext,
    })

    if (!includes(["ready", "outdated"], status.state)) {
      throw new RuntimeError(`Service ${action.name} is not running`, {
        actionName: action.name,
        status,
      })
    }

    const statusIngresses = status.detail?.ingresses

    if (!statusIngresses || statusIngresses.length === 0) {
      throw new ParameterError(`Service ${action.name} has no active ingresses`, {
        actionName: action.name,
        status,
      })
    }

    // find the correct endpoint to call
    let matchedIngress: ServiceIngress | null = null
    let matchedPath

    // we can't easily support raw TCP or UDP in a command like this
    const ingresses = statusIngresses.filter((e) => e.protocol === "http" || e.protocol === "https")

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

      for (const ingress of statusIngresses) {
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
      throw new ParameterError(`${action.longDescription()} does not have an HTTP/HTTPS ingress at ${path}`, {
        actionName: action.name,
        path,
        availableIngresses: statusIngresses,
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
        deployName,
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
