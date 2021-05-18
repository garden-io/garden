/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { IncomingHttpHeaders } from "http"

import { got, GotHeaders, GotHttpError, GotJsonOptions } from "../util/http"
import { findProjectConfig } from "../config/base"
import { CommandError, EnterpriseApiError } from "../exceptions"
import { LogEntry } from "../logger/log-entry"
import { gardenEnv } from "../constants"
import { ClientAuthToken } from "../db/entities/client-auth-token"
import { Cookie } from "tough-cookie"
import { add, sub, isAfter } from "date-fns"
import { isObject } from "lodash"
import { deline } from "../util/string"
import chalk from "chalk"

// If a GARDEN_AUTH_TOKEN is present and Garden is NOT running from a workflow runner pod,
// switch to ci-token authentication method.
export const authTokenHeader =
  gardenEnv.GARDEN_AUTH_TOKEN && !gardenEnv.GARDEN_GE_SCHEDULED ? "x-ci-token" : "x-access-auth-token"

export const makeAuthHeader = (clientAuthToken: string) => ({ [authTokenHeader]: clientAuthToken })

function is401Error(error: any): error is GotHttpError {
  return error instanceof GotHttpError && error.response.statusCode === 401
}

const refreshThreshold = 10 // Threshold (in seconds) subtracted to jwt validity when checking if a refresh is needed

export interface ApiFetchParams {
  headers: GotHeaders
  method: "GET" | "POST" | "PUT" | "PATCH" | "HEAD" | "DELETE"
  retry: boolean
  retryDescription?: string
  maxRetries?: number
  body?: any
}

export interface ApiFetchOptions {
  headers?: GotHeaders
  /**
   * True by default except for api.post (where retry = true must explicitly be passed, since retries aren't always
   * safe / desirable for such requests).
   */
  retry?: boolean
  maxRetries?: number
  /**
   * An optional prefix to use for retry error messages.
   */
  retryDescription?: string
}

export interface AuthTokenResponse {
  token: string
  refreshToken: string
  tokenValidity: number
}

export type ApiFetchResponse<T> = T & {
  headers: IncomingHttpHeaders
}

/**
 * A helper function that finds a project without resolving template strings and returns the enterprise
 * config. Needed since the EnterpriseApi is generally used before initializing the Garden class.
 */
export async function getEnterpriseConfig(currentDirectory: string) {
  const projectConfig = await findProjectConfig(currentDirectory)
  if (!projectConfig) {
    throw new CommandError(`Not a project directory (or any of the parent directories): ${currentDirectory}`, {
      currentDirectory,
    })
  }

  const domain = projectConfig.domain
  const projectId = projectConfig.id
  if (!domain || !projectId) {
    return
  }

  return { domain, projectId }
}

/**
 * The Enterprise API client.
 *
 * Can only be initialized if the user is actually logged in. Includes a handful of static helper methods
 * for cases where the user is not logged in (e.g. the login method itself).
 */
export class EnterpriseApi {
  private intervalId: NodeJS.Timer | null
  private log: LogEntry
  private intervalMsec = 4500 // Refresh interval in ms, it needs to be less than refreshThreshold/2
  private apiPrefix = "api"
  public domain: string
  public projectId: string

  constructor(log: LogEntry, enterpriseDomain: string, projectId: string) {
    this.log = log
    this.domain = enterpriseDomain
    this.projectId = projectId
  }

  /**
   * Initialize the Enterprise API.
   *
   * Returns null if the project is not configured for Garden Enterprise or if the user is not logged in.
   * Throws if the user is logged in but the token is invalid and can't be refreshed.
   *
   * Optionally skip logging during initialization. Useful for noProject commands that need to use the class
   * without all the "flair".
   */
  static async factory({
    log,
    currentDirectory,
    skipLogging = false,
  }: {
    log: LogEntry
    currentDirectory: string
    skipLogging?: boolean
  }) {
    log.debug("Initializing enterprise API client.")

    const config = await getEnterpriseConfig(currentDirectory)
    if (!config) {
      log.debug("Enterprise domain and/or project ID missing. Aborting.")
      return null
    }

    const token = await EnterpriseApi.getClientAuthTokenFromDb(log)
    if (!token && !gardenEnv.GARDEN_AUTH_TOKEN) {
      log.debug("User is not logged in. Aborting.")
      return null
    }

    const api = new EnterpriseApi(log, config.domain, config.projectId)
    const tokenIsValid = await api.checkClientAuthToken()

    const enterpriseLog = skipLogging
      ? null
      : log.info({ section: "garden-enterprise", msg: "Authorizing...", status: "active" })

    if (gardenEnv.GARDEN_AUTH_TOKEN) {
      // Throw if using an invalid "CI" access token
      if (!tokenIsValid) {
        throw new EnterpriseApiError(
          "The provided access token is expired or has been revoked, please create a new one from the Garden Enterprise UI.",
          {}
        )
      }
    } else {
      // Refresh the token if it's invalid.
      if (!tokenIsValid) {
        enterpriseLog?.debug({ msg: `Current auth token is invalid, refreshing` })
        try {
          // We can assert the token exsists since we're not using GARDEN_AUTH_TOKEN
          await api.refreshToken(token!)
        } catch (err) {
          enterpriseLog?.setError({ msg: `Invalid session`, append: true })
          enterpriseLog?.warn(deline`
          Your session is invalid and could not be refreshed. If you were previously logged
          in to another instance of Garden Enterprise, please log out first and then
          log back in again.
        `)
          throw err
        }
      }

      // Start refresh interval if using JWT
      log.debug({ msg: `Starting refresh interval.` })
      api.startInterval()
    }

    enterpriseLog?.setSuccess({ msg: chalk.green("Done"), append: true })
    return api
  }

  static async saveAuthToken(log: LogEntry, tokenResponse: AuthTokenResponse) {
    try {
      const manager = ClientAuthToken.getConnection().manager
      await manager.transaction(async (transactionalEntityManager) => {
        await transactionalEntityManager.clear(ClientAuthToken)
        await transactionalEntityManager.save(
          ClientAuthToken,
          ClientAuthToken.create({
            token: tokenResponse.token,
            refreshToken: tokenResponse.refreshToken,
            validity: add(new Date(), { seconds: tokenResponse.tokenValidity / 1000 }),
          })
        )
      })
      log.debug("Saved client auth token to local config db")
    } catch (error) {
      log.error(`An error occurred while saving client auth token to local config db:\n${error.message}`)
    }
  }

  /**
   * Returns the full client auth token from the local DB.
   *
   * In the inconsistent/erroneous case of more than one auth token existing in the local store, picks the first auth
   * token and deletes all others.
   */
  static async getClientAuthTokenFromDb(log: LogEntry) {
    const [tokens, tokenCount] = await ClientAuthToken.findAndCount()

    const token = tokens[0] ? tokens[0] : undefined

    if (tokenCount > 1) {
      log.debug("More than one client auth token found, clearing up...")
      try {
        await ClientAuthToken.getConnection()
          .createQueryBuilder()
          .delete()
          .from(ClientAuthToken)
          .where("token != :token", { token: token?.token })
          .execute()
      } catch (error) {
        log.error(`An error occurred while clearing up duplicate client auth tokens:\n${error.message}`)
      }
    }
    log.silly(`Retrieved client auth token from local config db`)

    return token
  }

  /**
   * If a persisted client auth token was found, or if the GARDEN_AUTH_TOKEN environment variable is present,
   * returns it. Returns null otherwise.
   *
   * Note that the GARDEN_AUTH_TOKEN environment variable takes precedence over a persisted auth token if both are
   * present.
   */
  static async getAuthToken(log: LogEntry): Promise<string | undefined> {
    const tokenFromEnv = gardenEnv.GARDEN_AUTH_TOKEN
    if (tokenFromEnv) {
      log.silly("Read client auth token from env")
      return tokenFromEnv
    }
    return (await EnterpriseApi.getClientAuthTokenFromDb(log))?.token
  }

  /**
   * If a persisted client auth token exists, deletes it.
   */
  static async clearAuthToken(log: LogEntry) {
    await ClientAuthToken.getConnection().createQueryBuilder().delete().from(ClientAuthToken).execute()
    log.debug("Cleared persisted auth token (if any)")
  }

  private startInterval() {
    this.log.debug({ msg: `Will run refresh function every ${this.intervalMsec} ms.` })
    this.intervalId = setInterval(() => {
      this.refreshTokenIfExpired().catch((err) => {
        this.log.debug({ msg: "Something went wrong while trying to refresh the authentication token." })
        this.log.debug({ msg: err.message })
      })
    }, this.intervalMsec)
  }

  close() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async refreshTokenIfExpired() {
    const token = await ClientAuthToken.findOne()

    if (!token || gardenEnv.GARDEN_AUTH_TOKEN) {
      this.log.debug({ msg: "Nothing to refresh, returning." })
      return
    }

    if (isAfter(new Date(), sub(token.validity, { seconds: refreshThreshold }))) {
      await this.refreshToken(token)
    }
  }

  private async refreshToken(token: ClientAuthToken) {
    try {
      let res: any
      res = await this.get<any>("token/refresh", { headers: { Cookie: `rt=${token?.refreshToken}` } })

      let cookies: any
      if (res.headers["set-cookie"] instanceof Array) {
        cookies = res.headers["set-cookie"].map((cookieStr) => {
          return Cookie.parse(cookieStr)
        })
      } else {
        cookies = [Cookie.parse(res.headers["set-cookie"] || "")]
      }

      const rt = cookies.find((cookie: any) => cookie?.key === "rt")
      const tokenObj = {
        token: res.data.jwt,
        refreshToken: rt.value || "",
        tokenValidity: res.data.jwtValidity,
      }
      await EnterpriseApi.saveAuthToken(this.log, tokenObj)
    } catch (err) {
      this.log.debug({ msg: `Failed to refresh the token.` })
      const detail = is401Error(err) ? { statusCode: err.response.statusCode } : {}
      throw new EnterpriseApiError(
        `An error occurred while verifying client auth token with Garden Enterprise: ${err.message}`,
        detail
      )
    }
  }

  private async apiFetch<T>(path: string, params: ApiFetchParams): Promise<ApiFetchResponse<T>> {
    const { method, headers, retry, retryDescription } = params
    this.log.silly({ msg: `Calling enterprise API with ${method} ${path}` })
    const token = await EnterpriseApi.getAuthToken(this.log)
    // TODO add more logging details
    const requestObj = {
      method,
      headers: {
        ...headers,
        ...makeAuthHeader(token || ""),
      },
      json: params.body,
    }

    const requestOptions: GotJsonOptions = {
      ...requestObj,
      responseType: "json",
    }

    if (retry) {
      let retryLog: LogEntry | undefined = undefined
      const retryLimit = params.maxRetries || 3
      requestOptions.retry = {
        methods: ["GET", "POST", "PUT", "DELETE"], // We explicitly include the POST method if `retry = true`.
        statusCodes: [
          408, // Request Timeout
          // 413, // Payload Too Large: No use in retrying.
          429, // Too Many Requests
          // 500, // Internal Server Error: Generally not safe to retry without potentially creating duplicate data.
          502, // Bad Gateway
          503, // Service Unavailable
          504, // Gateway Timeout

          // Cloudflare-specific status codes
          521, // Web Server Is Down
          522, // Connection Timed Out
          524, // A Timeout Occurred
        ],
        limit: retryLimit,
      }
      requestOptions.hooks = {
        beforeRetry: [
          (_options, error, retryCount) => {
            if (error) {
              const description = retryDescription || "Request"
              retryLog = retryLog || this.log.debug("")
              const statusCodeDescription = error.code ? ` (status code ${error.code})` : ``
              retryLog.setState(deline`
                ${description} failed with error ${error.message}${statusCodeDescription},
                retrying (${retryCount}/${retryLimit})
              `)
            }
          },
        ],
      }
    } else {
      requestOptions.retry = 0 // Disables retry
    }

    const res = await got<T>(`${this.domain}/${this.apiPrefix}/${path}`, requestOptions)

    if (!isObject(res.body)) {
      throw new EnterpriseApiError(`Unexpected API response`, {
        path,
        body: res?.body,
      })
    }

    return {
      ...res.body,
      headers: res.headers,
    }
  }

  async get<T>(path: string, opts: ApiFetchOptions = {}) {
    const { headers, retry, retryDescription, maxRetries } = opts
    return await this.apiFetch<T>(path, {
      method: "GET",
      headers: headers || {},
      retry: retry === false ? false : true, // defaults to true unless false is explicitly passed
      retryDescription,
      maxRetries,
    })
  }

  async delete<T>(path: string, opts: ApiFetchOptions = {}) {
    const { headers, retry, retryDescription, maxRetries } = opts
    return await this.apiFetch<T>(path, {
      method: "DELETE",
      headers: headers || {},
      retry: retry === false ? false : true, // defaults to true unless false is explicitly passed
      retryDescription,
      maxRetries,
    })
  }

  async post<T>(path: string, opts: ApiFetchOptions & { body?: any } = {}) {
    const { body, headers, retry, retryDescription, maxRetries } = opts
    return this.apiFetch<T>(path, {
      method: "POST",
      body: body || {},
      headers: headers || {},
      retry: retry === true ? true : false, // defaults to false unless true is explicitly passed
      retryDescription,
      maxRetries,
    })
  }

  /**
   * Checks with the backend whether the provided client auth token is valid.
   */
  async checkClientAuthToken(): Promise<boolean> {
    let valid = false
    try {
      this.log.debug(`Checking client auth token with Garden Enterprise: ${this.domain}/token/verify`)
      await this.get("token/verify")
      valid = true
    } catch (err) {
      if (!is401Error(err)) {
        throw new EnterpriseApiError(
          `An error occurred while verifying client auth token with Garden Enterprise: ${err.message}`,
          {}
        )
      }
    }
    this.log.debug(`Checked client auth token with Garden Enterprise - valid: ${valid}`)
    return valid
  }
}
