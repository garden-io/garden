/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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
import { InternalError } from "../exceptions"
import { EnterpriseApi, AuthTokenResponse } from "./api"

/**
 * Logs in to Garden Enterprise if needed, and returns a valid client auth token.
 */
export async function login(enterpriseApi: EnterpriseApi, log: LogEntry): Promise<string> {
  const savedToken = await enterpriseApi.readAuthToken()
  // Ping platform with saved token (if it exists)
  if (savedToken) {
    log.debug("Local client auth token found, verifying it with platform...")
    if (await enterpriseApi.checkClientAuthToken(log)) {
      log.debug("Local client token is valid, no need for login.")
      return savedToken
    }
  }

  /**
   * Else, start auth redirect server and wait for its redirect handler to receive
   * the redirect and finish running.
   */
  const events = new EventEmitter2()
  const server = new AuthRedirectServer(enterpriseApi, events, log)
  log.debug(`Redirecting to Garden Enterprise login page...`)
  const response: AuthTokenResponse = await new Promise(async (resolve, _reject) => {
    // The server resolves the promise with the new auth token once it's received the redirect.
    await server.start()
    events.once("receivedToken", (tokenResponse: AuthTokenResponse) => {
      log.debug("Received client auth token.")
      resolve(tokenResponse)
    })
  })
  await server.close()
  if (!response) {
    throw new InternalError(`Error: Did not receive an auth token after logging in.`, {})
  }
  await enterpriseApi.saveAuthToken(response)
  return response.token
}

export async function logout(enterpriseApi: EnterpriseApi, log: LogEntry): Promise<void> {
  const savedToken = await enterpriseApi.readAuthToken()
  // Ping platform with saved token (if it exists)
  if (savedToken) {
    log.debug("Local client auth token found, verifying it with platform...")
    if (await enterpriseApi.checkClientAuthToken(log)) {
      log.debug("Local client token is valid, no need for login.")
    }
  }
}

// TODO: Add analytics tracking
export class AuthRedirectServer {
  private log: LogEntry
  private server: Server
  private app: Koa
  private enterpriseApi: EnterpriseApi
  private events: EventEmitter2

  constructor(enterpriseApi: EnterpriseApi, events: EventEmitter2, log: LogEntry, public port?: number) {
    this.enterpriseApi = enterpriseApi
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
    await open(`${this.enterpriseApi.getDomain()}/clilogin/${this.port}`)
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
        token: jwt,
        refreshToken: rt,
        tokenValidity: jwtval,
      }
      this.log.debug("Received client auth token")
      this.events.emit("receivedToken", tokenResponse)
      ctx.redirect(`${this.enterpriseApi.getDomain()}/clilogin/success`)
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
