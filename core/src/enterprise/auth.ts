/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import open from "open"
import { Server } from "http"
import Koa from "koa"
import { EventEmitter2 } from "eventemitter2"
import bodyParser = require("koa-bodyparser")
import Router = require("koa-router")
import getPort = require("get-port")
import { LogEntry } from "../logger/log-entry"
import { AuthTokenResponse } from "./api"
import { isArray } from "lodash"

// TODO: Add analytics tracking
export class AuthRedirectServer {
  private log: LogEntry
  private server: Server
  private app: Koa
  private enterpriseDomain: string
  private events: EventEmitter2

  constructor(enterpriseDomain: string, events: EventEmitter2, log: LogEntry, public port?: number) {
    this.enterpriseDomain = enterpriseDomain
    this.events = events
    this.log = log.placeholder()
  }

  async start() {
    if (this.app) {
      return
    }

    if (!this.port) {
      this.port = await getPort()
    }

    await this.createApp()
    await open(`${this.enterpriseDomain}/clilogin/${this.port}`)
  }

  async close() {
    this.log.debug("Shutting down redirect server...")
    return this.server.close()
  }

  async createApp() {
    const app = new Koa()
    const http = new Router()

    http.get("/", async (ctx) => {
      const { jwt, rt, jwtval } = ctx.request.query
      const tokenResponse: AuthTokenResponse = {
        token: getFirstValue(jwt),
        refreshToken: getFirstValue(rt),
        tokenValidity: parseInt(getFirstValue(jwtval), 10),
      }
      this.log.debug("Received client auth token")
      this.events.emit("receivedToken", tokenResponse)
      ctx.redirect(`${this.enterpriseDomain}/clilogin/success`)
    })

    app.use(bodyParser())
    app.use(http.allowedMethods())
    app.use(http.routes())
    app.on("error", (err) => {
      this.log.error(`Auth redirect request failed with status ${err.status}: ${err.message}`)
    })
    this.server = app.listen(this.port)
  }
}

function getFirstValue(v: string | string[]) {
  return isArray(v) ? v[0] : v
}
