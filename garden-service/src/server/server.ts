/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import Koa = require("koa")
import serve = require("koa-static")
import Router = require("koa-router")
import websockify = require("koa-websocket")
import bodyParser = require("koa-bodyparser")
import getPort = require("get-port")
import { Garden } from "../garden"
import { addWebsocketEndpoint } from "./websocket"
import { prepareCommands, resolveRequest } from "./commands"
import { DASHBOARD_STATIC_DIR } from "../constants"
import { LogEntry } from "../logger/log-entry"

export const DEFAULT_PORT = 9777

/**
 * Start an HTTP server that exposes commands and events for the given Garden instance.
 *
 * Please look at the tests for usage examples.
 *
 * NOTE:
 * If `port` is not specified, a random free port is chosen. This is done so that a process can always create its
 * own server, but we won't need that functionality once we run a shared service across commands.
 */
export async function startServer(garden: Garden, log: LogEntry, port?: number) {
  log = log.placeholder()

  const app = await createApp(garden, log)

  // TODO: remove this once we stop running a server per CLI command
  if (!port) {
    port = await getPort()
  }

  // TODO: secure the server
  const server = app.listen(port)

  const url = `http://localhost:${port}`

  log.info({
    emoji: "sunflower",
    msg: chalk.cyan("Garden dashboard and API server running on ") + url,
  })

  return server
}

export async function createApp(garden: Garden, log: LogEntry) {
  // prepare request-command map
  const commands = await prepareCommands()

  const app = websockify(new Koa())
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
    const result = await resolveRequest(ctx, garden, log, commands, ctx.request.body)

    ctx.status = 200
    ctx.response.body = result
  })

  app.use(bodyParser())
  app.use(http.routes())
  app.use(http.allowedMethods())

  // TODO: Bundle the dashboard with the NPM / Zeit packages
  app.use(serve(DASHBOARD_STATIC_DIR))

  addWebsocketEndpoint(app, garden, log, commands)

  return app
}
