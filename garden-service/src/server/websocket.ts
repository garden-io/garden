/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("joi")
import Router = require("koa-router")
import websockify = require("koa-websocket")
import { Garden } from "../garden"
import { CommandResult } from "../commands/base"
import { EventName, Events } from "../events"
import { ValueOf } from "../util/util"
import { resolveRequest, CommandMap } from "./commands"
import { omit } from "lodash"
import { LogEntry } from "../logger/log-entry"
import { toGardenError, GardenError } from "../exceptions"

/**
 * Add the /ws endpoint to the Koa app. Every event emitted to the event bus is forwarded to open
 * Websocket connections, and clients can send commands over the socket and receive results on the
 * same connection.
 */
export function addWebsocketEndpoint(app: websockify.App, garden: Garden, log: LogEntry, commands: CommandMap) {
  const ws = new Router()

  ws.get("/ws", async (ctx) => {
    // Helper to make JSON messages, make them type-safe, and to log errors.
    const send = <T extends ServerWebsocketMessageType>(type: T, payload: ServerWebsocketMessages[T]) => {
      ctx.websocket.send(JSON.stringify({ type, ...<object>payload }), (err) => {
        if (err) {
          const error = toGardenError(err)
          log.error({ error })
        }
      })
    }

    // Pipe everything from the event bus to the socket.
    const eventListener = (name, payload) => send("event", { name, payload })
    garden.events.onAny(eventListener)

    // Make sure we clean up listeners when connections end.
    // TODO: detect broken connections - https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
    ctx.websocket.on("close", () => {
      garden.events.offAny(eventListener)
    })

    // Respond to commands.
    ctx.websocket.on("message", (msg) => {
      let request

      try {
        request = JSON.parse(msg.toString())
      } catch {
        return send("error", { message: "Could not parse message as JSON" })
      }

      const requestId = request.id

      try {
        Joi.attempt(requestId, Joi.string().uuid().required())
      } catch {
        return send("error", { message: "Message should contain an `id` field with a UUID value" })
      }

      try {
        Joi.attempt(request.type, Joi.string().required())
      } catch {
        return send("error", { message: "Message should contain a type field" })
      }

      if (request.type === "command") {
        resolveRequest(ctx, garden, commands, omit(request, ["id", "type"]))
          .then(result => {
            send("commandResult", { requestId, result: result.result, errors: result.errors })
          })
          .catch(err => {
            send("error", { requestId, message: err.message })
          })
      } else {
        return send("error", { requestId, message: `Unsupported request type: ${request.type}` })
      }
    })
  })

  app.ws.use(ws.routes())
  app.ws.use(ws.allowedMethods())
}

interface ServerWebsocketMessages {
  commandResult: {
    requestId: string,
    result: CommandResult<any>,
    errors?: GardenError[],
  }
  error: {
    requestId?: string,
    message: string,
  }
  event: {
    name: EventName,
    payload: ValueOf<Events>,
  }
}

type ServerWebsocketMessageType = keyof ServerWebsocketMessages
