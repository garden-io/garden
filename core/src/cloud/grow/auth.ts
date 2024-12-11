/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TRPCClientError } from "@trpc/client"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
// import type { Server } from "bun"
import { add } from "date-fns"
import cloneDeep from "fast-copy"
import dedent from "dedent"
import deline from "deline"
import getPort from "get-port"
import open from "open"
import type { GlobalConfigStore } from "../../config-store/global.js"
import type { Log } from "../../logger/log-entry.js"
import { apiClient } from "./trpc.js"
import { getCloudDistributionName } from "./util.js"
import type EventEmitter2 from "eventemitter2"
import { gardenEnv } from "../../constants.js"
import { CloudApiTokenRefreshError } from "../api.js"
import { CloudApiError, InternalError } from "../../exceptions.js"

export interface AuthToken {
  token: string
  refreshToken: string
  tokenValidity: number
}

export interface PersistedAuthToken {
  token: string
  refreshToken: string
  validity: Date
}

export function isTokenExpired(token: PersistedAuthToken) {
  const now = new Date()
  return now > token.validity
}

/**
 * Checks with the backend whether the provided client auth token is valid.
 */
export async function isTokenValid({ authToken, log }: { authToken: string; log: Log }): Promise<boolean> {
  let valid = false

  try {
    log.debug(`Checking client auth token with ${getCloudDistributionName()}`)
    const verificationResult = await apiClient.token.verifyToken.query({ token: authToken })
    valid = verificationResult.valid
  } catch (err) {
    if (!(err instanceof TRPCError)) {
      throw err
    }

    const httpCode = getHTTPStatusCodeFromError(err)

    if (httpCode !== 401) {
      throw new CloudApiError({
        message: `An error occurred while verifying client auth token with ${getCloudDistributionName()}: ${err.message}`,
        responseStatusCode: httpCode,
      })
    }
  }

  log.debug(`Checked client auth token with ${getCloudDistributionName()} - valid: ${valid}`)

  return valid
}

export async function saveAuthToken(
  log: Log,
  globalConfigStore: GlobalConfigStore,
  tokenResponse: AuthToken,
  domain: string
) {
  const distroName = getCloudDistributionName()

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
    await globalConfigStore.set("clientAuthTokens", domain, {
      token: tokenResponse.token,
      refreshToken: tokenResponse.refreshToken,
      validity: add(new Date(), { seconds: validityMs / 1000 }),
    })
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
export async function getStoredAuthToken(log: Log, globalConfigStore: GlobalConfigStore, domain: string) {
  log.silly(() => `Retrieving client auth token from config store`)
  return globalConfigStore.get("clientAuthTokens", domain)
}

/**
 * If a persisted client auth token was found, or if the GARDEN_AUTH_TOKEN environment variable is present,
 * returns it. Returns null otherwise.
 *
 * Note that the GARDEN_AUTH_TOKEN environment variable takes precedence over a persisted auth token if both are
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

export async function refreshAuthTokenAndWriteToConfigStore(
  log: Log,
  globalConfigStore: GlobalConfigStore,
  domain: string,
  refreshToken: string
) {
  try {
    const result = await apiClient.token.refreshToken.mutate({ refreshToken })
    await saveAuthToken(
      log,
      globalConfigStore,
      { token: result.accessToken, refreshToken: result.refreshToken, tokenValidity: result.tokenValidity },
      domain
    )

    return result
  } catch (err) {
    if (!(err instanceof TRPCClientError)) {
      throw err
    }

    log.debug({ msg: `Failed to refresh the token.` })
    throw new CloudApiTokenRefreshError({
      message: `An error occurred while verifying client auth token with ${getCloudDistributionName()}: ${err.message}`,
    })
  }
}

export class AuthRedirectServer {
  private log: Log
  // TODO: implement server machinery
  // private server?: Server
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
    // if (this.server) {
    //   return
    // }

    if (!this.port) {
      this.port = await getPort()
    }

    await this.createApp()
    const url = new URL(`/login?port=${this.port}`, this.enterpriseDomain)
    await open(url.href)
  }

  async close() {
    this.log.debug("Shutting down redirect server...")

    // if (this.server) {
    //   return this.server.stop()
    // }

    return undefined
  }

  async createApp() {
    // const log = this.log
    // const events = this.events
    // const enterpriseDomain = this.enterpriseDomain
    // this.server = Bun.serve({
    //   port: this.port,
    //   async fetch(request) {
    //     const url = new URL(request.url)
    //     if (url.pathname !== "/") {
    //       return new Response("Not found", { status: 404 })
    //     }
    //     if (request.method !== "GET") {
    //       return new Response("Method not allowed", { status: 405 })
    //     }
    //     const searchParams = new URLSearchParams(url.search)
    //     let token: z.infer<typeof tokenSchema> | undefined
    //     try {
    //       token = tokenSchema.parse(Object.fromEntries(searchParams))
    //     } catch (error) {
    //       log.error("Invalid query parameters")
    //       return new Response("Invalid query parameters", { status: 400 })
    //     }
    //     log.debug("Received client auth token")
    //     events.emit("receivedToken", {
    //       // Note that internally we use `token` as the key for the access token.
    //       token: token.accessToken,
    //       refreshToken: token.refreshToken,
    //       tokenValidity: token.tokenValidity,
    //     })
    //     let returnUrl = new URL("/confirm-cli-auth", enterpriseDomain).href
    //     returnUrl = `${returnUrl}?cliLoginSuccess=true`
    //     log.debug(`Redirecting to: ${returnUrl}`)
    //     return new Response(null, {
    //       status: 302,
    //       headers: {
    //         Location: returnUrl,
    //       },
    //     })
    //   },
    // })
  }
}

// const tokenSchema = z.object({
//   accessToken: z.string(),
//   refreshToken: z.string(),
//   tokenValidity: z
//     .number()
//     .or(z.string())
//     .transform((value) => parseInt(value.toString(), 10)),
// })
