/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../logger/log-entry.js"
import type { GlobalConfigStore } from "../../config-store/global.js"
import { isTokenExpired, isTokenValid, refreshAuthTokenAndWriteToConfigStore } from "./auth.js"
import type {
  ApiClient,
  CreateActionResultRequest,
  CreateActionResultResponse,
  DockerBuildReport,
  GetActionResultRequest,
  GetActionResultResponse,
  RegisterCloudBuildRequest,
  RegisterCloudBuildResponse,
} from "./trpc.js"
import { describeTRPCClientError, getAuthenticatedApiClient } from "./trpc.js"
import type { GardenErrorParams } from "../../exceptions.js"
import { CloudApiError, GardenError } from "../../exceptions.js"
import { gardenEnv } from "../../constants.js"
import { LogLevel } from "../../logger/logger.js"
import { getCloudDistributionName, getCloudLogSectionName } from "../util.js"
import { getStoredAuthToken } from "../auth.js"
import type { CloudApiFactoryParams, CloudApiParams } from "../api.js"
import { deline } from "../../util/string.js"
import { TRPCClientError } from "@trpc/client"
import type { InferrableClientTypes } from "@trpc/server/unstable-core-do-not-import"
import { createGrpcTransport } from "@connectrpc/connect-node"
import { createClient } from "@connectrpc/connect"
import { GardenEventIngestionService } from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"

const refreshThreshold = 10 // Threshold (in seconds) subtracted to jwt validity when checking if a refresh is needed

export type GrowCloudApiFactory = (params: CloudApiFactoryParams) => Promise<GrowCloudApi | undefined>

export class GrowCloudError extends GardenError {
  readonly type = "garden-cloud-v2-error"
}

export class GrowCloudTRPCError extends GrowCloudError {
  override readonly cause: TRPCClientError<InferrableClientTypes> | undefined

  constructor({ message, cause }: GardenErrorParams & { cause: TRPCClientError<InferrableClientTypes> }) {
    super({ message })
    this.cause = cause
  }

  public static wrapTRPCClientError(err: TRPCClientError<InferrableClientTypes>) {
    const errorDesc = describeTRPCClientError(err)
    return new GrowCloudTRPCError({
      message: `An error occurred while calling Garden Backend: ${errorDesc.short}`,
      cause: err,
    })
  }
}

/**
 * The Cloud API V2 client.
 *
 * Is only initialized if the user is actually logged.
 */
export class GrowCloudApi {
  private intervalId: ReturnType<typeof setInterval> | null = null // TODO: fix type here (getting tsc error)
  private readonly intervalMsec = 4500 // Refresh interval in ms, it needs to be less than refreshThreshold/2

  private readonly log: Log
  public readonly domain: string
  public readonly organizationId: string
  public readonly distroName: string
  private readonly api: ApiClient
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
    this.distroName = getCloudDistributionName(domain)
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
    const distroName = getCloudDistributionName(cloudDomain)
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

    const tokenValid = await isTokenValid({ cloudDomain, authToken, log })

    if (!tokenValid) {
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

  async uploadDockerBuildReport(dockerBuildReport: DockerBuildReport) {
    try {
      return this.api.dockerBuild.create.mutate({ ...dockerBuildReport, organizationId: this.organizationId })
    } catch (err) {
      if (!(err instanceof TRPCClientError)) {
        throw err
      }

      this.log.debug(`Failed to send build report to Garden Cloud: ${err}`)
      return { timeSaved: 0 }
    }
  }

  async registerCloudBuild({
    platforms,
    mtlsClientPublicKeyPEM,
  }: RegisterCloudBuildRequest): Promise<RegisterCloudBuildResponse> {
    try {
      return await this.api.cloudBuilder.registerBuild.mutate({
        organizationId: this.organizationId,
        platforms,
        mtlsClientPublicKeyPEM,
      })
    } catch (err) {
      if (!(err instanceof TRPCClientError)) {
        throw err
      }

      this.log.debug(`Failed to register build in Container Builder: ${err}`)
      return {
        version: "v2",
        availability: {
          available: false,
          reason: err.message,
        },
      }
    }
  }

  async getActionResult({
    schemaVersion,
    actionRef,
    actionType,
    cacheKey,
  }: GetActionResultRequest): Promise<GetActionResultResponse> {
    try {
      return await this.api.actionCache.getEntry.query({
        schemaVersion,
        organizationId: this.organizationId,
        actionRef,
        actionType,
        cacheKey,
      })
    } catch (err) {
      if (!(err instanceof TRPCClientError)) {
        throw err
      }

      throw GrowCloudTRPCError.wrapTRPCClientError(err)
    }
  }

  async createActionResult({
    schemaVersion,
    actionRef,
    actionType,
    cacheKey,
    result,
    startedAt,
    completedAt,
  }: CreateActionResultRequest): Promise<CreateActionResultResponse> {
    try {
      return await this.api.actionCache.createEntry.mutate({
        schemaVersion,
        organizationId: this.organizationId,
        actionRef,
        actionType,
        cacheKey,
        result,
        startedAt,
        completedAt,
      })
    } catch (err) {
      if (!(err instanceof TRPCClientError)) {
        throw err
      }

      throw GrowCloudTRPCError.wrapTRPCClientError(err)
    }
  }

  // GRPC clients

  private get grpcTransport() {
    this.log.debug({ msg: `Using gRPC transport with URL: ${this.domain}` })
    return createGrpcTransport({
      baseUrl: this.domain,

      // Interceptors apply to all calls running through this transport.
      interceptors: [],
    })
  }

  public get eventIngestionService() {
    return createClient(GardenEventIngestionService, this.grpcTransport)
  }
}
