/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { got, GotResponse, GotHeaders } from "../util/http"
import { findProjectConfig } from "../config/base"
import { CommandError, RuntimeError } from "../exceptions"
import { LogEntry } from "../logger/log-entry"
import { gardenEnv } from "../constants"
import { ClientAuthToken } from "../db/entities/client-auth-token"
import { Cookie } from "tough-cookie"
import { add, sub, isAfter } from "date-fns"
import { Command } from "../commands/base"

// If a GARDEN_AUTH_TOKEN is present and Garden is NOT running from a workflow runner pod,
// switch to ci-token authentication method.
export const authTokenHeader =
  gardenEnv.GARDEN_AUTH_TOKEN && !gardenEnv.GARDEN_GE_SCHEDULED ? "x-ci-token" : "x-access-auth-token"

export const makeAuthHeader = (clientAuthToken: string) => ({ [authTokenHeader]: clientAuthToken })

const refreshThreshold = 10 // Threshold (in seconds) subtracted to jwt validity when checking if a refresh is needed

export interface ApiFetchParams {
  headers: GotHeaders
  method: "GET" | "POST" | "PUT" | "PATCH" | "HEAD" | "DELETE"
}
export interface AuthTokenResponse {
  token: string
  refreshToken: string
  tokenValidity: number
}

export class EnterpriseApi {
  private intervalId: NodeJS.Timer | null
  protected log: LogEntry
  protected enterpriseDomain: string
  protected intervalMsec = 4500 // Refresh interval in ms, it needs to be less than refreshThreshold/2
  protected apiPrefix = "api"

  constructor(log: LogEntry) {
    this.log = log
  }

  getDomain() {
    return this.enterpriseDomain
  }

  async init(currentDirectory: string, command?: Command) {
    this.log.debug("Attempting to initialize EnterpriseAPI client.")

    const commandAllowed = !["login", "logout"].includes(command?.getFullName() || "")
    if (command && command.noProject && commandAllowed) {
      return
    }

    const projectConfig = await findProjectConfig(currentDirectory)
    if (!projectConfig) {
      throw new CommandError(`Not a project directory (or any of the parent directories): ${currentDirectory}`, {
        currentDirectory,
      })
    }
    const enterpriseDomain = projectConfig.domain
    if (!enterpriseDomain) {
      return
    }
    this.enterpriseDomain = enterpriseDomain
    const authToken = await this.readAuthToken()
    if (authToken && !gardenEnv.GARDEN_AUTH_TOKEN && commandAllowed) {
      this.log.debug({ msg: `Refreshing auth token and starting refresh interval.` })
      const tokenIsValid = await this.checkClientAuthToken(this.log)
      if (!tokenIsValid) {
        await this.refreshToken()
      }
      this.startInterval()
    }
  }

  startInterval() {
    this.log.debug({ msg: `Will run refresh function every ${this.intervalMsec} ms.` })
    this.intervalId = setInterval(() => {
      this.refreshToken().catch((err) => {
        this.log.debug(err)
      })
    }, this.intervalMsec)
  }

  async close() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  async refreshToken() {
    const invalidCredentialsErrorMsg = "Your Garden Enteprise credentials have expired. Please login again."
    const token = await ClientAuthToken.findOne()

    if (!token) {
      throw new RuntimeError(invalidCredentialsErrorMsg, {})
    }
    if (isAfter(new Date(), sub(token.validity, { seconds: refreshThreshold }))) {
      try {
        const res = await this.get(this.log, "token/refresh", {
          Cookie: `rt=${token?.refreshToken}`,
        })

        let cookies: any
        if (res.headers["set-cookie"] instanceof Array) {
          cookies = res.headers["set-cookie"].map((cookieStr) => {
            return Cookie.parse(cookieStr)
          })
        } else {
          cookies = [Cookie.parse(res.headers["set-cookie"] || "")]
        }

        const rt = cookies.find((cookie) => cookie.key === "rt")
        const tokenObj = {
          token: res.body.data.jwt,
          refreshToken: rt.value || "",
          tokenValidity: res.body.data.jwtValidity,
        }
        await this.saveAuthToken(tokenObj)
      } catch (err) {
        const res = err.response

        if (res && res.statusCode === 401) {
          this.log.debug({ msg: `Failed to refresh the token.` })
          await this.clearAuthToken()
          throw new RuntimeError(invalidCredentialsErrorMsg, {})
        } else {
          throw new RuntimeError(
            `An error occurred while verifying client auth token with platform: ${err.message}`,
            {}
          )
        }
      }
    }
  }

  async saveAuthToken(tokenResponse: AuthTokenResponse) {
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
      this.log.debug("Saved client auth token to local config db")
    } catch (error) {
      this.log.error(`An error occurred while saving client auth token to local config db:\n${error.message}`)
    }
  }

  /**
   * If a persisted client auth token was found, or if the GARDEN_AUTH_TOKEN environment variable is present,
   * returns it. Returns null otherwise.
   *
   * Note that the GARDEN_AUTH_TOKEN environment variable takes precedence over a persisted auth token if both are
   * present.
   *
   * In the inconsistent/erroneous case of more than one auth token existing in the local store, picks the first auth
   * token and deletes all others.
   */
  async readAuthToken(): Promise<string | null> {
    const tokenFromEnv = gardenEnv.GARDEN_AUTH_TOKEN
    if (tokenFromEnv) {
      this.log.debug("Read client auth token from env")
      return tokenFromEnv
    }

    const [tokens, tokenCount] = await ClientAuthToken.findAndCount()

    const token = tokens[0] ? tokens[0].token : null

    if (tokenCount > 1) {
      this.log.debug("More than one client auth tokens found, clearing up...")
      try {
        await ClientAuthToken.getConnection()
          .createQueryBuilder()
          .delete()
          .from(ClientAuthToken)
          .where("token != :token", { token })
          .execute()
      } catch (error) {
        this.log.error(`An error occurred while clearing up duplicate client auth tokens:\n${error.message}`)
      }
    }
    this.log.silly(`Retrieved client auth token from local config db`)

    return token
  }

  async logout() {
    const token = await ClientAuthToken.findOne()
    if (!token) {
      // Noop when the user is not logged in
      return
    }
    try {
      await this.post(this.log, "token/logout", {
        headers: {
          Cookie: `rt=${token?.refreshToken}`,
        },
      })

      await this.clearAuthToken()
    } catch (error) {
      this.log.error({ msg: "An error occurred while logging out." })
      this.log.debug({ msg: JSON.stringify(error, null, 2) })
    }
  }

  /**
   * If a persisted client auth token exists, deletes it.
   */
  async clearAuthToken() {
    await ClientAuthToken.getConnection().createQueryBuilder().delete().from(ClientAuthToken).execute()
    this.log.debug("Cleared persisted auth token (if any)")
  }

  private async apiFetch(log: LogEntry, path: string, params: ApiFetchParams, body?: any): Promise<GotResponse<any>> {
    const { method, headers } = params
    log.debug({ msg: `Fetching enterprise APIs. ${method} ${path}` })
    const clientAuthToken = await this.readAuthToken()
    // TODO add more logging details
    const requestObj = {
      method,
      headers: {
        ...headers,
        ...makeAuthHeader(clientAuthToken || ""),
      },
      json: body || undefined,
    }

    const res = await got(`${this.enterpriseDomain}/${this.apiPrefix}/${path}`, {
      ...requestObj,
      responseType: "json",
    })
    return res
  }

  async get(log: LogEntry, path: string, headers?: GotHeaders) {
    log.debug({ msg: `PATH ${path} headers ${JSON.stringify(headers, null, 2)}` })
    return this.apiFetch(log, path, {
      headers: headers || {},
      method: "GET",
    })
  }

  async post(log: LogEntry, path: string, payload: { body?: any; headers?: GotHeaders } = { body: {} }) {
    const { headers, body } = payload
    return this.apiFetch(
      log,
      path,
      {
        headers: headers || {},
        method: "POST",
      },
      body
    )
  }

  /**
   * Checks with the backend whether the provided client auth token is valid.
   */
  async checkClientAuthToken(log: LogEntry): Promise<boolean> {
    let valid = false
    try {
      log.debug(`Checking client auth token with platform: ${this.getDomain()}/token/verify`)
      await this.get(log, "token/verify")
      valid = true
    } catch (err) {
      const res = err.response
      if (res.statusCode === 401) {
        valid = false
      } else {
        throw new RuntimeError(`An error occurred while verifying client auth token with platform: ${err.message}`, {})
      }
    }
    log.debug(`Checked client auth token with platform - valid: ${valid}`)
    return valid
  }
}
