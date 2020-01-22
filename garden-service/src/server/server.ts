/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Server } from "http"

import chalk from "chalk"
import Koa from "koa"
import mount = require("koa-mount")
import serve = require("koa-static")
import Router = require("koa-router")
import websockify from "koa-websocket"
import bodyParser = require("koa-bodyparser")
import getPort = require("get-port")
import { omit } from "lodash"

import { Garden } from "../garden"
import { prepareCommands, resolveRequest, CommandMap } from "./commands"
import { DASHBOARD_STATIC_DIR } from "../constants"
import { LogEntry } from "../logger/log-entry"
import { CommandResult } from "../commands/base"
import { toGardenError, GardenError } from "../exceptions"
import { EventName, Events } from "../events"
import { ValueOf } from "../util/util"
import { AnalyticsHandler } from "../analytics/analytics"
import { joi } from "../config/common"

export const DEFAULT_PORT = 9777
const notReadyMessage = "Waiting for Garden instance to initialize"

/**
 * Start an HTTP server that exposes commands and events for the given Garden instance.
 *
 * Please look at the tests for usage examples.
 *
 * NOTE:
 * If `port` is not specified, a random free port is chosen. This is done so that a process can always create its
 * own server, but we won't need that functionality once we run a shared service across commands.
 */
export async function startServer(log: LogEntry, port?: number) {
  // Start HTTP API and dashboard server.
  // allow overriding automatic port picking
  if (!port) {
    port = Number(process.env.GARDEN_SERVER_PORT) || undefined
  }
  const server = new GardenServer(log, port)
  await server.start()
  return server
}

export class GardenServer {
  private log: LogEntry
  private server: Server
  private garden: Garden | undefined
  private app: websockify.App
  private analytics: AnalyticsHandler

  constructor(log: LogEntry, public port?: number) {
    this.log = log.placeholder()
    this.garden = undefined
  }

  async start() {
    if (this.server) {
      return
    }

    if (!this.port) {
      this.port = await getPort({ port: DEFAULT_PORT })
    }

    this.app = await this.createApp()

    // TODO: secure the server
    this.server = this.app.listen(this.port)

    const url = `http://localhost:${this.port}`

    this.log.info("")
    this.log.info({
      emoji: "sunflower",
      msg: chalk.cyan("Garden dashboard and API server running on ") + url,
    })
  }

  async close() {
    return this.server.close()
  }

  setGarden(garden: Garden) {
    this.garden = garden

    // Serve artifacts as static assets
    this.app.use(mount("/artifacts", serve(garden.artifactsPath)))
  }

  private async createApp() {
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
      if (!this.garden) {
        return this.notReady(ctx)
      }

      if (!this.analytics) {
        this.analytics = await AnalyticsHandler.init(this.garden, this.log)
      }

      await this.analytics.trackApi("POST", ctx.originalUrl, { ...ctx.request.body })

      // TODO: set response code when errors are in result object?
      const result = await resolveRequest(ctx, this.garden, this.log, commands, ctx.request.body)

      ctx.status = 200
      ctx.response.body = result
    })

    app.use(bodyParser())
    app.use(http.routes())
    app.use(http.allowedMethods())

    // This enables navigating straight to a nested route, e.g. "localhost:<PORT>/graph".
    // FIXME: We need to be able to do this for any route, instead of hard coding the routes like this.
    const routes = ["/", "/graph", "/logs"]
    for (const route of routes) {
      app.use(mount(route, serve(DASHBOARD_STATIC_DIR)))
    }

    this.addWebsocketEndpoint(app, commands)

    return app
  }

  private notReady(ctx: Router.IRouterContext) {
    ctx.status = 503
    ctx.response.body = notReadyMessage
  }

  /**
   * Add the /ws endpoint to the Koa app. Every event emitted to the event bus is forwarded to open
   * Websocket connections, and clients can send commands over the socket and receive results on the
   * same connection.
   */
  private addWebsocketEndpoint(app: websockify.App, commands: CommandMap) {
    const wsRouter = new Router()

    wsRouter.get("/ws", async (ctx) => {
      if (!this.garden) {
        return this.notReady(ctx)
      }

      // The typing for koa-websocket isn't working currently
      const websocket: Koa.Context["ws"] = ctx["websocket"]

      // Helper to make JSON messages, make them type-safe, and to log errors.
      const send = <T extends ServerWebsocketMessageType>(type: T, payload: ServerWebsocketMessages[T]) => {
        websocket.send(JSON.stringify({ type, ...(<object>payload) }), (err) => {
          if (err) {
            const error = toGardenError(err)
            this.log.error({ error })
          }
        })
      }

      // Pipe everything from the event bus to the socket.
      const eventListener = (name, payload) => send("event", { name, payload })
      this.garden.events.onAny(eventListener)

      // Make sure we clean up listeners when connections end.
      // TODO: detect broken connections - https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
      websocket.on("close", () => {
        this.garden && this.garden.events.offAny(eventListener)
      })

      // Respond to commands.
      websocket.on("message", (msg) => {
        let request: any

        try {
          request = JSON.parse(msg.toString())
        } catch {
          return send("error", { message: "Could not parse message as JSON" })
        }

        const requestId = request.id

        try {
          joi.attempt(
            requestId,
            joi
              .string()
              .uuid()
              .required()
          )
        } catch {
          return send("error", {
            message: "Message should contain an `id` field with a UUID value",
          })
        }

        try {
          joi.attempt(request.type, joi.string().required())
        } catch {
          return send("error", {
            message: "Message should contain a type field",
          })
        }

        if (request.type === "command") {
          if (!this.garden) {
            send("error", { requestId, message: notReadyMessage })
            return
          }

          resolveRequest(ctx, this.garden, this.log, commands, omit(request, ["id", "type"]))
            .then((result) => {
              send("commandResult", {
                requestId,
                result: result.result,
                errors: result.errors,
              })
            })
            .catch((err) => {
              send("error", { requestId, message: err.message })
            })
        } else {
          return send("error", {
            requestId,
            message: `Unsupported request type: ${request.type}`,
          })
        }
      })
    })

    app.ws.use(<Koa.Middleware<websockify.MiddlewareContext<any>>>wsRouter.routes())
    app.ws.use(<Koa.Middleware<websockify.MiddlewareContext<any>>>wsRouter.allowedMethods())
  }
}

interface ServerWebsocketMessages {
  commandResult: {
    requestId: string
    result: CommandResult<any>
    errors?: GardenError[]
  }
  error: {
    requestId?: string
    message: string
  }
  event: {
    name: EventName
    payload: ValueOf<Events>
  }
}

type ServerWebsocketMessageType = keyof ServerWebsocketMessages

export type ServerWebsocketMessage = ServerWebsocketMessages[ServerWebsocketMessageType] & {
  type: ServerWebsocketMessageType
}
