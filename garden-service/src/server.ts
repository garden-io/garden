/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import Koa = require("koa")
import Router = require("koa-router")
import bodyParser = require("koa-bodyparser")
import dedent = require("dedent")
import Joi = require("joi")
import getPort = require("get-port")
import { Command, Parameters } from "./commands/base"
import { validate } from "./config/common"
import { coreCommands } from "./commands/commands"
import { mapValues, omitBy } from "lodash"
import { Garden } from "./garden"
import { LogLevel } from "./logger/log-node"

/**
 * Start an HTTP server that exposes commands and events for the given Garden instance.
 *
 * NOTE:
 * If `port` is not specified, a random free port is chosen. This is done so that a process can always create its
 * own server, but we won't need that functionality once we run a shared service across commands.
 */
export async function startServer(garden: Garden, port?: number) {
  // prepare request-command map
  const commands = await prepareCommands()

  const app = new Koa()
  const http = new Router()

  /**
   * HTTP API endpoint (POST /api)
   *
   * We don't expose a different route per command, but rather accept a JSON object via POST on /api
   * with a `command` key. The API wouldn't be RESTful in any meaningful sense anyway, and this
   * means we can keep a consistent format across mechanisms.
   */
  http.post("/api", async (ctx) => {
    // TODO: set response code when errors are in result object?
    const result = await resolveRequest(ctx, garden, commands, ctx.request.body)

    ctx.response.body = result
  })

  /**
   * Dashboard endpoint (GET /)
   *
   * TODO: flesh this out, just a placeholder
   */
  http.get("/", async (ctx) => {
    const status = await resolveRequest(ctx, garden, commands, {
      command: "get.status",
    })

    ctx.response.body = dedent`
      <html>
      <body>
        <h2>Project status</h2>
        <pre>
      ${JSON.stringify(status.result, null, 4)}
        </pre>
      </body>
      </html>
    `
  })

  app.use(bodyParser())
  app.use(http.routes())
  app.use(http.allowedMethods())

  // TODO: implement WebSocket endpoint
  // const ws = new Router()
  // ws.get("/ws", async (ctx) => {

  // })
  // app.use(ws.routes())
  // app.use(ws.allowedMethods())

  // TODO: remove this once we stop running a server per CLI command
  if (!port) {
    port = await getPort()
  }

  // TODO: secure the server
  app.listen(port)

  const url = `http://localhost:${port}`

  garden.log.info({
    emoji: "sunflower",
    msg: chalk.cyan("Garden dashboard and API server running on ") + url,
  })
}

interface CommandMap {
  [key: string]: {
    command: Command,
    requestSchema: Joi.ObjectSchema,
    // TODO: implement resultSchema on Commands, so we can include it here as well (for docs mainly)
  }
}

const baseRequestSchema = Joi.object()
  .keys({
    command: Joi.string()
      .required()
      .description("The command name to run.")
      .example("get.status"),
    parameters: Joi.object()
      .keys({})
      .default(() => ({}), "{}")
      .description("The parameters for the command."),
  })

/**
 * Validate and map a request body to a Command, execute its action, and return its result.
 */
async function resolveRequest(ctx: Koa.Context, garden: Garden, commands: CommandMap, request: any) {
  // Perform basic validation and find command.
  try {
    request = validate(request, baseRequestSchema, { context: "API request" })
  } catch {
    ctx.throw(400, "Invalid request format")
  }

  const commandSpec = commands[request.command]

  if (!commandSpec) {
    ctx.throw(404, `Could not find command ${request.command}`)
  }

  // Validate command parameters.
  try {
    request = validate(request, commandSpec.requestSchema)
  } catch {
    ctx.throw(400, `Invalid request format for command ${request.command}`)
  }

  // Prepare arguments for command action.
  const command = commandSpec.command

  // TODO: Creating a new Garden instance is not ideal,
  //       need to revisit once we've refactored the TaskGraph and config resolution.
  const cmdGarden = await Garden.factory(garden.projectRoot, { log: garden.log })

  // We generally don't want actions to log anything in the server.
  const log = garden.log.placeholder(LogLevel.silly)

  const cmdArgs = mapParams(ctx, request.parameters, command.arguments)
  const cmdOpts = mapParams(ctx, request.parameters, command.options)

  return command.action({ garden: cmdGarden, log, args: cmdArgs, opts: cmdOpts })
  // TODO: validate result schema
}

async function prepareCommands(): Promise<CommandMap> {
  const commands: CommandMap = {}

  function addCommand(command: Command) {
    const requestSchema = baseRequestSchema
      .keys({
        parameters: Joi.object()
          .keys({
            ...paramsToJoi(command.arguments),
            ...paramsToJoi(command.options),
          }),
      })

    commands[command.getKey()] = {
      command,
      requestSchema,
    }

    command.getSubCommands().forEach(addCommand)
  }

  coreCommands.forEach(addCommand)

  return commands
}

function paramsToJoi(params?: Parameters) {
  if (!params) {
    return {}
  }

  params = omitBy(params, p => p.cliOnly)

  return mapValues(params, p => {
    let schema = p.schema.description(p.help)
    if (p.required) {
      schema = schema.required()
    }
    if (p.defaultValue) {
      schema = schema.default(p.defaultValue)
    }
    return schema
  })
}

/**
 * Prepare the args or opts for a Command action, by mapping input values to the parameter specs.
 */
function mapParams(ctx: Koa.Context, values: object, params?: Parameters) {
  if (!params) {
    return {}
  }

  return mapValues(params, (p, key) => {
    if (p.cliOnly) {
      return p.defaultValue
    }

    const value = values[key]

    const result = p.schema.validate(value)
    if (result.error) {
      ctx.throw(400, result.error.message)
    }
    return result.value
  })
}
