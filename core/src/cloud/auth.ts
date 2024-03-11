/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import open from "open"
import type { Server } from "http"
import Koa from "koa"
import type EventEmitter2 from "eventemitter2"
import bodyParser from "koa-bodyparser"
import Router from "koa-router"
import getPort from "get-port"
import type { Log } from "../logger/log-entry.js"
import type { AuthTokenResponse } from "./api.js"
import { isArray } from "lodash-es"
import { gardenEnv } from "../constants.js"

// If a GARDEN_AUTH_TOKEN is present and Garden is NOT running from a workflow runner pod,
// switch to ci-token authentication method.
export const authTokenHeader =
  gardenEnv.GARDEN_AUTH_TOKEN && !gardenEnv.GARDEN_GE_SCHEDULED ? "x-ci-token" : "x-access-auth-token"

export const makeAuthHeader = (clientAuthToken: string) => ({ [authTokenHeader]: clientAuthToken })

// TODO: Add analytics tracking
export class AuthRedirectServer {
  private log: Log
  private server?: Server
  private app?: Koa
  private enterpriseDomain: string
  private events: EventEmitter2.EventEmitter2

  constructor(
    enterpriseDomain: string,
    events: EventEmitter2.EventEmitter2,
    log: Log,
    public port?: number
  ) {
    this.enterpriseDomain = enterpriseDomain
    this.events = events
    this.log = log.createLog({})
  }

  async start() {
    if (this.app) {
      return
    }

    if (!this.port) {
      this.port = await getPort()
    }

    await this.createApp()
    const url = new URL(`/clilogin/${this.port}`, this.enterpriseDomain)
    await open(url.href)
  }

  async close() {
    this.log.debug("Shutting down redirect server...")

    if (this.server) {
      return this.server.close()
    }

    return undefined
  }

  async createApp() {
    const app = new Koa()
    const http = new Router()

    http.get("/", async (ctx) => {
      const { jwt, rt, jwtval } = ctx.request.query
      // TODO: validate properly
      const tokenResponse: AuthTokenResponse = {
        token: getFirstValue(jwt!),
        refreshToken: getFirstValue(rt!),
        tokenValidity: parseInt(getFirstValue(jwtval!), 10),
      }
      this.log.debug("Received client auth token")
      this.events.emit("receivedToken", tokenResponse)
      ctx.redirect(`${this.enterpriseDomain}/clilogin/success`)
      const url = new URL("/clilogin/success", this.enterpriseDomain)
      ctx.redirect(url.href)
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
