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
import cloneDeep from "fast-copy"
import type { Log } from "../logger/log-entry.js"
import { gardenEnv } from "../constants.js"
import type { ClientAuthToken, GlobalConfigStore } from "../config-store/global.js"
import { dedent, deline } from "../util/string.js"
import { CloudApiError, InternalError } from "../exceptions.js"
import { add } from "date-fns"
import { getCloudDistributionName } from "./util.js"
import type { ParsedUrlQuery } from "node:querystring"

export interface AuthToken {
  token: string
  refreshToken: string
  tokenValidity: number
}

export async function saveAuthToken(
  log: Log,
  globalConfigStore: GlobalConfigStore,
  tokenResponse: AuthToken,
  domain: string
) {
  const distroName = getCloudDistributionName(domain)

  if (!tokenResponse.token) {
    const errMsg = deline`
        Received a null/empty client auth token while logging in. This indicates that either your user account hasn't
        yet been created in ${distroName}, or that there's a problem with your account's VCS username / login
        credentials.
      `
    throw new CloudApiError({ message: errMsg })
  }
  try {
    const validityMs = tokenResponse.tokenValidity || 604800000
    const clientAuthToken: ClientAuthToken = {
      token: tokenResponse.token,
      refreshToken: tokenResponse.refreshToken,
      validity: add(new Date(), { seconds: validityMs / 1000 }),
    }
    await globalConfigStore.set("clientAuthTokens", domain, clientAuthToken)
    log.debug("Saved client auth token to config store")
  } catch (error) {
    const redactedResponse = cloneDeep(tokenResponse)
    if (redactedResponse.refreshToken) {
      redactedResponse.refreshToken = "<Redacted>"
    }
    if (redactedResponse.token) {
      redactedResponse.token = "<Redacted>"
    }
    // If we get here, this is a bug.
    throw InternalError.wrapError(
      error,
      dedent`
        An error occurred while saving client auth token to local config db.

        Token response: ${JSON.stringify(redactedResponse)}`
    )
  }
}

/**
 * Returns the full client auth token from the local DB.
 *
 * In the inconsistent/erroneous case of more than one auth token existing in the local store, picks the first auth
 * token and deletes all others.
 */
export async function getStoredAuthToken(
  log: Log,
  globalConfigStore: GlobalConfigStore,
  domain: string
): Promise<ClientAuthToken | undefined> {
  log.silly(() => `Retrieving client auth token from config store`)
  return globalConfigStore.get("clientAuthTokens", domain)
}

/**
 * If a persisted client auth token was found, or if the `GARDEN_AUTH_TOKEN` environment variable is present,
 * returns it. Returns `undefined` otherwise.
 *
 * Note that the `GARDEN_AUTH_TOKEN` environment variable takes precedence over a persisted auth token if both are
 * present.
 */
export async function getAuthToken(
  log: Log,
  globalConfigStore: GlobalConfigStore,
  domain: string
): Promise<string | undefined> {
  const tokenFromEnv = gardenEnv.GARDEN_AUTH_TOKEN
  if (tokenFromEnv) {
    log.silly(() => "Read client auth token from env")
    return tokenFromEnv
  }
  return (await getStoredAuthToken(log, globalConfigStore, domain))?.token
}

/**
 * If a persisted client auth token exists, deletes it.
 */
export async function clearAuthToken(log: Log, globalConfigStore: GlobalConfigStore, domain: string) {
  await globalConfigStore.delete("clientAuthTokens", domain)
  log.debug("Cleared persisted auth token (if any)")
}

// If a GARDEN_AUTH_TOKEN is present and Garden is NOT running from a workflow runner pod,
// switch to ci-token authentication method.
export const authTokenHeader =
  gardenEnv.GARDEN_AUTH_TOKEN && !gardenEnv.GARDEN_GE_SCHEDULED ? "x-ci-token" : "x-access-auth-token"

export const makeAuthHeader = (clientAuthToken: string) => ({ [authTokenHeader]: clientAuthToken })

export type AuthRedirectServerConfig = {
  events: EventEmitter2.EventEmitter2
  log: Log
  getLoginUrl: (port: number) => string
  successUrl: string
  extractAuthToken: (query: ParsedUrlQuery) => AuthToken
}

// TODO: Add analytics tracking
export class AuthRedirectServer {
  private readonly log: Log

  private server?: Server
  private app?: Koa

  constructor(private readonly config: AuthRedirectServerConfig) {
    this.log = config.log.createLog({})
  }

  async start() {
    if (this.app) {
      return
    }

    const port = await getPort()

    await this.createApp(port)
    await open(this.config.getLoginUrl(port))
  }

  async close() {
    this.log.debug("Shutting down redirect server...")

    if (this.server) {
      return this.server.close()
    }

    return undefined
  }

  async createApp(port: number) {
    const app = new Koa()
    const http = new Router()

    http.get("/", async (ctx) => {
      const tokenResponse = this.config.extractAuthToken(ctx.request.query)
      this.log.debug("Received client auth token")
      this.config.events.emit("receivedToken", tokenResponse)
      ctx.redirect(this.config.successUrl)
    })

    app.use(bodyParser())
    app.use(http.allowedMethods())
    app.use(http.routes())
    app.on("error", (err) => {
      this.log.error(`Auth redirect request failed with status ${err.status}: ${err.message}`)
    })
    this.server = app.listen(port)
    this.app = app
  }
}
