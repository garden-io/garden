/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../logger/log-entry.js"
import type { GlobalConfigStore } from "../../config-store/global.js"
import { isTokenExpired, isTokenValid, refreshAuthTokenAndWriteToConfigStore } from "./auth.js"
import type { ApiClient } from "./trpc.js"
import { getAuthenticatedApiClient, getNonAuthenticatedApiClient } from "./trpc.js"
import { CloudApiError } from "../../exceptions.js"
import { gardenEnv } from "../../constants.js"
import { LogLevel } from "../../logger/logger.js"
import { getCloudLogSectionName } from "../util.js"
import { getStoredAuthToken } from "../auth.js"
import type { CloudApiFactoryParams, CloudApiParams } from "../api.js"
import { deline } from "../../util/string.js"
import { getGrowCloudDistributionName } from "./util.js"

const refreshThreshold = 10 // Threshold (in seconds) subtracted to jwt validity when checking if a refresh is needed

export type GrowCloudApiFactory = (params: CloudApiFactoryParams) => Promise<GrowCloudApi | undefined>

/**
 * The Cloud API client.
 *
 * Is only initialized if the user is actually logged in.
 */
export class GrowCloudApi {
  private intervalId: ReturnType<typeof setInterval> | null = null // TODO: fix type here (getting tsc error)
  private readonly intervalMsec = 4500 // Refresh interval in ms, it needs to be less than refreshThreshold/2

  private readonly log: Log
  public readonly domain: string
  public readonly organizationId: string
  public readonly distroName: string
  public readonly api: ApiClient
  private readonly globalConfigStore: GlobalConfigStore
  private authToken: string

  constructor({
    log,
    domain,
    globalConfigStore,
    organizationId,
    authToken,
  }: CloudApiParams & {
    authToken: string
    organizationId: string
  }) {
    this.log = log
    this.domain = domain
    this.organizationId = organizationId
    this.distroName = getGrowCloudDistributionName()
    this.globalConfigStore = globalConfigStore

    this.authToken = authToken
    const tokenGetter = () => this.authToken
    this.api = getAuthenticatedApiClient({ hostUrl: domain, tokenGetter })
  }

  /**
   * Initialize the Cloud API.
   *
   * Returns `undefined` if the user is not logged in.
   *
   * Throws if the user is logged in but the token is invalid and can't be refreshed.
   *
   * Optionally skip logging during initialization. Useful for noProject commands that need to use the class
   * without all the "flair".
   */
  static async factory({
    log,
    cloudDomain,
    organizationId,
    globalConfigStore,
    skipLogging = false,
  }: CloudApiFactoryParams): Promise<GrowCloudApi | undefined> {
    if (!organizationId) {
      return undefined
    }
    const distroName = getGrowCloudDistributionName()
    const cloudLogSectionName = getCloudLogSectionName(distroName)
    const fixLevel = skipLogging ? LogLevel.silly : undefined
    const cloudFactoryLog = log.createLog({ fixLevel, name: cloudLogSectionName, showDuration: true })
    const cloudLog = log.createLog({ name: cloudLogSectionName })
    const successMsg = "Successfully authorized"

    cloudFactoryLog.info("Authorizing...")

    if (gardenEnv.GARDEN_AUTH_TOKEN) {
      log.silly(() => "Using auth token from GARDEN_AUTH_TOKEN env var")
      if (!(await isTokenValid({ authToken: gardenEnv.GARDEN_AUTH_TOKEN, cloudDomain, log: cloudLog }))) {
        throw new CloudApiError({
          message: deline`
          The provided access token is expired or has been revoked for ${cloudDomain}, please create a new one from the ${distroName} UI.
          `,
          responseStatusCode: 401,
        })
      }

      cloudFactoryLog.success(successMsg)
      return new GrowCloudApi({
        log: cloudLog,
        domain: cloudDomain,
        organizationId,
        globalConfigStore,
        authToken: gardenEnv.GARDEN_AUTH_TOKEN,
        projectId: undefined,
      })
    }

    const tokenData = await getStoredAuthToken(log, globalConfigStore, cloudDomain)
    let authToken = tokenData?.token

    if (!tokenData || !authToken) {
      log.debug(
        `No auth token found, proceeding without access to ${distroName}. Command results for this command run will not be available in ${distroName}.`
      )
      return undefined
    }

    // Refresh the token if it has expired.
    if (isTokenExpired(tokenData)) {
      cloudFactoryLog.debug({ msg: `Current auth token is expired, attempting to refresh` })
      authToken = (
        await refreshAuthTokenAndWriteToConfigStore(log, globalConfigStore, cloudDomain, tokenData.refreshToken)
      ).accessToken
    }

    const verificationResult = await getNonAuthenticatedApiClient({ hostUrl: cloudDomain }).token.verifyToken.query({
      token: authToken,
    })
    if (!verificationResult.valid) {
      log.debug({ msg: `The stored token was not valid.` })
      return undefined
    }

    // Start refresh interval if using JWT
    const api = new GrowCloudApi({
      log: cloudLog,
      domain: cloudDomain,
      organizationId,
      globalConfigStore,
      authToken,
      projectId: undefined,
    })
    cloudFactoryLog.debug({ msg: `Starting refresh interval.` })
    api.startInterval()

    cloudFactoryLog.success(successMsg)
    return api
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
    if (gardenEnv.GARDEN_AUTH_TOKEN) {
      return
    }

    const token = await this.globalConfigStore.get("clientAuthTokens", this.domain)

    if (!token) {
      this.log.debug({ msg: "Nothing to refresh, returning." })
      return
    }

    // Note: lazy-loading for startup performance
    const { sub, isAfter } = await import("date-fns")

    if (isAfter(new Date(), sub(token.validity, { seconds: refreshThreshold }))) {
      const tokenResponse = await refreshAuthTokenAndWriteToConfigStore(
        this.log,
        this.globalConfigStore,
        this.domain,
        token.refreshToken
      )
      this.authToken = tokenResponse.accessToken
    }
  }
}
