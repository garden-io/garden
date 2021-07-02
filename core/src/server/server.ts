/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
import { prepareCommands, parseRequest } from "./commands"
import { DASHBOARD_STATIC_DIR, gardenEnv } from "../constants"
import { LogEntry } from "../logger/log-entry"
import { Command, CommandResult } from "../commands/base"
import { toGardenError, GardenError } from "../exceptions"
import { EventName, Events, EventBus, GardenEventListener } from "../events"
import { uuidv4, ValueOf } from "../util/util"
import { AnalyticsHandler } from "../analytics/analytics"
import { joi } from "../config/common"
import { randomString } from "../util/string"
import { authTokenHeader } from "../enterprise/api"
import { ApiEventBatch } from "../enterprise/buffered-event-stream"
import { LogLevel } from "../logger/logger"

// Note: This is different from the `garden dashboard` default port.
// We may no longer embed servers in watch processes from 0.13 onwards.
export const defaultWatchServerPort = 9777
const notReadyMessage = "Waiting for Garden instance to initialize"

/**
 * Start an HTTP server that exposes commands and events for the given Garden instance.
 *
 * Please look at the tests for usage examples.
 *
 * NOTES:
 * If `port` is not specified, the default is used or a random free port is chosen if default is not available.
 * This is done so that a process can always create its own server, but we won't need that functionality once we
 * run a shared service across commands.
 */
export async function startServer({ log, port }: { log: LogEntry; port?: number }) {
  // Start HTTP API and dashboard server.
  // allow overriding automatic port picking
  if (!port) {
    port = gardenEnv.GARDEN_SERVER_PORT || undefined
  }
  const server = new GardenServer({ log, port })
  await server.start()
  return server
}

export class GardenServer {
  private log: LogEntry
  private debugLog: LogEntry
  private server: Server
  private garden: Garden | undefined
  private app: websockify.App
  private analytics: AnalyticsHandler
  private incomingEvents: EventBus
  private statusLog: LogEntry
  private serversUpdatedListener: GardenEventListener<"serversUpdated">
  private activePersistentRequests: { [requestId: string]: { command: Command; connId: string } }

  public port: number | undefined
  public readonly authKey: string

  constructor({ log, port }: { log: LogEntry; port?: number }) {
    this.log = log
    this.debugLog = this.log.placeholder({ level: LogLevel.debug, childEntriesInheritLevel: true })
    this.garden = undefined
    this.port = port
    this.authKey = randomString(64)
    this.incomingEvents = new EventBus()
    this.activePersistentRequests = {}

    this.serversUpdatedListener = ({ servers }) => {
      // Update status log line with new `garden dashboard` server, if any
      for (const { host, command } of servers) {
        if (command === "dashboard") {
          this.showUrl(host)
          return
        }
      }

      // No active explicit dashboard processes, show own URL instead
      this.showUrl(this.getUrl())
    }
  }

  async start() {
    if (this.server) {
      return
    }

    this.app = await this.createApp()

    if (this.port) {
      this.server = this.app.listen(this.port)
    } else {
      do {
        try {
          this.port = await getPort({ port: defaultWatchServerPort })
          this.server = this.app.listen(this.port)
        } catch {}
      } while (!this.server)
    }

    this.log.info("")
    this.statusLog = this.log.placeholder()
  }

  getUrl() {
    return `http://localhost:${this.port}`
  }

  showUrl(url?: string) {
    this.statusLog.setState({
      emoji: "sunflower",
      msg: chalk.cyan("Garden dashboard running at ") + (url || this.getUrl()),
    })
  }

  async close() {
    return this.server.close()
  }

  setGarden(garden: Garden) {
    if (this.garden) {
      this.garden.events.removeListener("serversUpdated", this.serversUpdatedListener)
    }

    this.garden = garden
    this.garden.log = this.debugLog

    // Serve artifacts as static assets
    this.app.use(mount("/artifacts", serve(garden.artifactsPath)))

    // Listen for new dashboard servers
    garden.events.on("serversUpdated", this.serversUpdatedListener)
  }

  private async createApp() {
    // prepare request-command map
    const commands = prepareCommands()

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
      // TODO: require auth key here from 0.13.0 onwards
      if (!this.garden) {
        return this.notReady(ctx)
      }

      if (!this.analytics) {
        try {
          this.analytics = await AnalyticsHandler.init(this.garden, this.debugLog)
        } catch (err) {
          throw err
        }
      }

      this.analytics.trackApi("POST", ctx.originalUrl, { ...ctx.request.body })

      const { command, log, args, opts } = parseRequest(ctx, this.debugLog, commands, ctx.request.body)

      const { persistent } = await command.prepare({
        log,
        headerLog: log,
        footerLog: log,
        args,
        opts,
      })

      if (persistent) {
        ctx.throw(400, "Attempted to run persistent command (e.g. a watch/follow command). Aborting.")
      }

      const result = await command.action({
        garden: this.garden,
        log,
        headerLog: log,
        footerLog: log,
        args,
        opts,
      })

      ctx.status = 200
      ctx.response.body = result
    })

    /**
     * Resolves the URL for the given provider dashboard page, and redirects to it.
     */
    http.get("/dashboardPages/:pluginName/:pageName", async (ctx) => {
      if (!this.garden) {
        return this.notReady(ctx)
      }

      const { pluginName, pageName } = ctx.params

      const actions = await this.garden.getActionRouter()
      const plugin = await this.garden.getPlugin(pluginName)
      const page = plugin.dashboardPages.find((p) => p.name === pageName)

      if (!page) {
        return ctx.throw(400, `Could not find page ${pageName} from provider ${pluginName}`)
      }

      const { url } = await actions.getDashboardPage({ log: this.log, page, pluginName })
      ctx.redirect(url)
    })

    /**
     * Events endpoint, for ingesting events from other Garden processes, and piping to any open websocket connections.
     * Requires a valid auth token header, matching `this.authKey`.
     *
     * The API matches that of the Garden Enterprise /events endpoint.
     */
    http.post("/events", async (ctx) => {
      const authHeader = ctx.header[authTokenHeader]

      if (authHeader !== this.authKey) {
        ctx.status = 401
        return
      }

      // TODO: validate the input

      const batch = ctx.request.body as ApiEventBatch
      this.debugLog.debug(`Received ${batch.events.length} events from session ${batch.sessionId}`)

      // Pipe the events to the incoming stream, which websocket listeners will then receive
      batch.events.forEach((e) => this.incomingEvents.emit(e.name, e.payload))

      ctx.status = 200
    })

    app.use(bodyParser())
    app.use(http.routes())
    app.use(http.allowedMethods())

    app.on("error", (err, ctx) => {
      this.debugLog.info(`API server request failed with status ${ctx.status}: ${err.message}`)
    })

    // This enables navigating straight to a nested route, e.g. "localhost:<PORT>/graph".
    // FIXME: We need to be able to do this for any route, instead of hard coding the routes like this.
    const routes = ["/", "/graph", "/logs"]
    for (const route of routes) {
      app.use(mount(route, serve(DASHBOARD_STATIC_DIR)))
    }

    this.addWebsocketEndpoint(app)

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
  private addWebsocketEndpoint(app: websockify.App) {
    const wsRouter = new Router()

    wsRouter.get("/ws", async (ctx) => {
      if (!this.garden) {
        return this.notReady(ctx)
      }

      const connId = uuidv4()

      // TODO: require auth key on connections here, from 0.13.0 onwards

      // The typing for koa-websocket isn't working currently
      const websocket: Koa.Context["ws"] = ctx["websocket"]

      // Helper to make JSON messages, make them type-safe, and to log errors.
      const send = <T extends ServerWebsocketMessageType>(type: T, payload: ServerWebsocketMessages[T]) => {
        const event = { type, ...(<object>payload) }
        this.log.debug(`Send event: ${JSON.stringify(event)}`)
        websocket.send(JSON.stringify(event), (err) => {
          if (err) {
            this.debugLog.debug({ error: toGardenError(err) })
          }
        })
      }

      const error = (message: string, requestId?: string) => {
        this.log.debug(message)
        return send("error", { message, requestId })
      }

      // Set up heartbeat to detect dead connections
      let isAlive = true

      let heartbeatInterval = setInterval(() => {
        if (!isAlive) {
          this.log.debug(`Connection ${connId} timed out.`)
          websocket.terminate()
        }

        isAlive = false
        this.log.debug(`Connection ${connId} ping.`)
        websocket.ping(() => {})
      }, 1000)

      websocket.on("pong", () => {
        this.log.debug(`Connection ${connId} pong.`)
        isAlive = true
      })

      // Pipe everything from the event bus to the socket, as well as from the /events endpoint
      const eventListener = (name: EventName, payload: any) => send("event", { name, payload })
      this.garden.events.onAny(eventListener)
      this.incomingEvents.onAny(eventListener)

      const cleanup = () => {
        this.log.debug(`Connection ${connId} terminated, cleaning up.`)
        clearInterval(heartbeatInterval)

        this.garden && this.garden.events.offAny(eventListener)
        this.incomingEvents.offAny(eventListener)

        for (const [id, req] of Object.entries(this.activePersistentRequests)) {
          if (connId === req.connId) {
            req.command.terminate()
            delete this.activePersistentRequests[id]
          }
        }
      }

      // Make sure we clean up listeners when connections end.
      // TODO: detect broken connections - https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
      websocket.on("close", cleanup)

      // Respond to commands.
      websocket.on("message", (msg) => {
        let request: any

        this.log.debug("Got request: " + msg)

        try {
          request = JSON.parse(msg.toString())
        } catch {
          return error("Could not parse message as JSON")
        }

        const requestId = request.id

        try {
          joi.attempt(requestId, joi.string().uuid().required())
        } catch {
          return error("Message should contain an `id` field with a UUID value", requestId)
        }

        try {
          joi.attempt(request.type, joi.string().required())
        } catch {
          return error("Message should contain a type field")
        }

        if (request.type === "command") {
          // Start a command
          const garden = this.garden

          if (!garden) {
            return send("error", { requestId, message: notReadyMessage })
          }

          try {
            const commands = prepareCommands()
            const { command, log, args, opts } = parseRequest(
              ctx,
              this.debugLog,
              commands,
              omit(request, ["id", "type"])
            )

            command
              .prepare({
                log,
                headerLog: log,
                footerLog: log,
                args,
                opts,
              })
              .then((prepareResult) => {
                const { persistent } = prepareResult

                if (persistent) {
                  send("commandStart", {
                    requestId,
                    args,
                    opts,
                  })
                  this.activePersistentRequests[requestId] = { command, connId }

                  command.subscribe((data: any) => {
                    send("commandOutput", {
                      requestId,
                      command: command.getFullName(),
                      data,
                    })
                  })
                }

                // TODO: validate result schema
                return command.action({
                  garden,
                  log,
                  headerLog: log,
                  footerLog: log,
                  args,
                  opts,
                })
              })
              .then((result) => {
                send("commandResult", {
                  requestId,
                  result: result.result,
                  errors: result.errors,
                })
              })
              .catch((err) => {
                error(err.message, requestId)
              })
          } catch (err) {
            return error(err.message, requestId)
          }
        } else if (request.type === "commandStatus") {
          const r = this.activePersistentRequests[requestId]
          const status = r ? "active" : "not found"
          send("commandStatus", {
            requestId,
            status,
          })
        } else if (request.type === "abortCommand") {
          const req = this.activePersistentRequests[requestId]
          req.command.terminate()
          delete this.activePersistentRequests[requestId]
        } else {
          return send("error", {
            requestId,
            message: `Unsupported request type: ${request.type}`,
          })
        }
      })
    })

    app.ws.use(<Koa.Middleware<any>>wsRouter.routes())
    app.ws.use(<Koa.Middleware<any>>wsRouter.allowedMethods())
  }
}

interface ServerWebsocketMessages {
  commandOutput: {
    requestId: string
    command: string
    data: string
  }
  commandResult: {
    requestId: string
    result: CommandResult<any>
    errors?: GardenError[]
  }
  commandStatus: {
    requestId: string
    status: "active" | "not found"
  }
  commandStart: {
    requestId: string
    args: object
    opts: object
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
