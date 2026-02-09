/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../logger/log-entry.js"
import type { ClientAuthToken, GlobalConfigStore } from "../../config-store/global.js"
import { isTokenExpired, isTokenValid, refreshAuthTokenAndWriteToConfigStore, revokeAuthToken } from "./auth.js"
import type {
  ApiTrpcClient,
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
import { CloudApiError, GardenError, ParameterError } from "../../exceptions.js"
import { gardenEnv } from "../../constants.js"
import { LogLevel } from "../../logger/logger.js"
import { getCloudDistributionName, getCloudLogSectionName } from "../util.js"
import { getStoredAuthToken } from "../api-legacy/auth.js"
import { dedent, deline } from "../../util/string.js"
import { TRPCClientError } from "@trpc/client"
import type { InferrableClientTypes } from "@trpc/server/unstable-core-do-not-import"
import { createGrpcTransport } from "@connectrpc/connect-node"
import { createClient } from "@connectrpc/connect"
import { GardenEventIngestionService } from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/events_pb.js"
import type { ImportVariablesConfig } from "../../config/project.js"
import { getVarlistIdsFromRemoteVarsConfig } from "../../config/project.js"
import { styles } from "../../logger/styles.js"
import { Memoize } from "typescript-memoize"
import { GrpcEventConverter } from "./grpc-event-converter.js"

const refreshThreshold = 10 // Threshold (in seconds) subtracted to jwt validity when checking if a refresh is needed

/**
 * Resolves the organization ID for a legacy project, or returns the provided one if none is found by the API.
 */
async function resolveOrganizationIdForLegacyProject({
  cloudDomain,
  authToken,
  legacyProjectId,
  organizationId,
  log,
  __trpcClientOverrideForTesting,
}: {
  cloudDomain: string
  authToken: string
  legacyProjectId: string
  organizationId: string | undefined
  log: Log
  __trpcClientOverrideForTesting?: ApiTrpcClient
}): Promise<string | undefined> {
  log.debug({ msg: `Legacy project ID found, resolving organization ID from project ID` })
  try {
    const resolvedOrgId = await GardenCloudApi.getDefaultOrganizationIdForLegacyProject(
      cloudDomain,
      authToken,
      legacyProjectId,
      __trpcClientOverrideForTesting
    )

    if (resolvedOrgId) {
      log.debug({ msg: `Resolved organization ID: ${resolvedOrgId}` })

      // Check for conflict and log if org ID is being updated
      if (organizationId && organizationId !== resolvedOrgId) {
        log.info({
          msg:
            dedent`
            Organization ID mismatch detected. The configured organizationId (${organizationId}) differs from the organization associated with the legacy project ID (${resolvedOrgId}).

            Using ${resolvedOrgId} from the legacy project ID. Your project configuration will be updated automatically.
          ` + "\n",
        })
      } else if (!organizationId) {
        log.warn({
          msg:
            dedent`
            Organization ID resolved from legacy project ID. Your project configuration will be updated to include the organization ID and comment out the legacy fields (project ID and domain).

            Recommended configuration:

              ${styles.command(`organizationId: ${resolvedOrgId}`)}
              # id: ${legacyProjectId}  # Legacy field, no longer needed
          ` + "\n",
        })
      }

      return resolvedOrgId
    } else {
      log.debug({ msg: `Could not resolve organization ID from project ID` })
      return organizationId
    }
  } catch (error) {
    log.warn({ msg: `Failed to resolve organization ID from project ID: ${error}` })
    // Fall back to provided organizationId if resolution fails
    return organizationId
  }
}

export type GardenCloudApiFactory = (params: GardenCloudApiFactoryParams) => Promise<GardenCloudApi | undefined>

export class GardenCloudError extends GardenError {
  readonly type = "garden-cloud-error"
}

export class GardenCloudTRPCError extends GardenCloudError {
  override readonly cause: TRPCClientError<InferrableClientTypes> | undefined

  constructor({ message, cause }: GardenErrorParams & { cause: TRPCClientError<InferrableClientTypes> }) {
    super({ message })
    this.cause = cause
  }

  public static wrapTRPCClientError(err: TRPCClientError<InferrableClientTypes>) {
    const errorDesc = describeTRPCClientError(err)
    return new GardenCloudTRPCError({
      message: `Garden Cloud API call failed with error: ${errorDesc.short}`,
      cause: err,
    })
  }
}

type GardenCloudApiParams = {
  log: Log
  domain: string
  globalConfigStore: GlobalConfigStore
  authToken: string
  organizationId: string
  __trpcClientOverrideForTesting?: ApiTrpcClient
}

interface GardenCloudApiFactoryParams {
  log: Log
  cloudDomain: string
  globalConfigStore: GlobalConfigStore
  organizationId: string | undefined
  legacyProjectId: string | undefined
  skipLogging?: boolean
  __trpcClientOverrideForTesting?: ApiTrpcClient
}

/**
 * The Cloud API client for app.garden.io.
 *
 * Is only initialized if the user is actually logged.
 */
export class GardenCloudApi {
  private intervalId: ReturnType<typeof setInterval> | null = null // TODO: fix type here (getting tsc error)
  private readonly intervalMsec = 4500 // Refresh interval in ms, it needs to be less than refreshThreshold/2

  private readonly log: Log
  public readonly domain: string
  public readonly organizationId: string
  public readonly distroName: string
  public readonly trpc: ApiTrpcClient
  private readonly globalConfigStore: GlobalConfigStore
  private authToken: string

  constructor({
    log,
    domain,
    globalConfigStore,
    organizationId,
    authToken,
    __trpcClientOverrideForTesting,
  }: GardenCloudApiParams) {
    this.log = log
    this.domain = domain
    this.organizationId = organizationId
    this.distroName = getCloudDistributionName(domain)
    this.globalConfigStore = globalConfigStore

    this.authToken = authToken
    const tokenGetter = () => this.authToken

    // Hacky way to set a fake tRPC client in tests since depdendency injecting it is a little tricky
    // due to the tokenGetter function which depends on class methods and needs to be set in the contructor.
    if (__trpcClientOverrideForTesting) {
      this.trpc = __trpcClientOverrideForTesting
    } else {
      this.trpc = getAuthenticatedApiClient({ hostUrl: domain, tokenGetter })
    }
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
    organizationId: paramOrganizationId,
    legacyProjectId,
    globalConfigStore,
    __trpcClientOverrideForTesting,
    skipLogging = false,
  }: GardenCloudApiFactoryParams): Promise<GardenCloudApi | undefined> {
    const distroName = getCloudDistributionName(cloudDomain)
    const cloudLogSectionName = getCloudLogSectionName(distroName)
    const fixLevel = skipLogging ? LogLevel.silly : undefined
    const cloudFactoryLog = log.createLog({ fixLevel, name: cloudLogSectionName, showDuration: true })
    const cloudLog = log.createLog({ name: cloudLogSectionName })
    const successMsg = "Successfully authorized"

    cloudFactoryLog.info("Authorizing...")

    let authToken: string | undefined
    let organizationId: string | undefined = paramOrganizationId

    if (gardenEnv.GARDEN_AUTH_TOKEN) {
      log.debug(() => "Using auth token from GARDEN_AUTH_TOKEN env var")
      if (
        !(await isTokenValid({
          authToken: gardenEnv.GARDEN_AUTH_TOKEN,
          cloudDomain,
          log: cloudLog,
          __trpcClientOverrideForTesting,
        }))
      ) {
        throw new CloudApiError({
          message: deline`
          The provided access token is expired or has been revoked for ${cloudDomain}, please create a new one from the ${distroName} UI.
          `,
          responseStatusCode: 401,
        })
      }

      authToken = gardenEnv.GARDEN_AUTH_TOKEN
    } else {
      const tokenData = await getStoredAuthToken(log, globalConfigStore, cloudDomain)
      authToken = tokenData?.token

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
          await refreshAuthTokenAndWriteToConfigStore({
            log,
            globalConfigStore,
            cloudDomain,
            refreshToken: tokenData.refreshToken,
            __trpcClientOverrideForTesting,
          })
        ).accessToken
      }

      const tokenValid = await isTokenValid({ cloudDomain, authToken, log, __trpcClientOverrideForTesting })

      if (!tokenValid) {
        log.debug({ msg: `The stored token was not valid.` })
        return undefined
      }
    }

    // Resolve organization ID from legacy project ID if available (always takes precedence)
    if (legacyProjectId) {
      organizationId = await resolveOrganizationIdForLegacyProject({
        cloudDomain,
        authToken,
        legacyProjectId,
        organizationId,
        log: cloudFactoryLog,
        __trpcClientOverrideForTesting,
      })
    }

    if (!organizationId) {
      throw new ParameterError({
        message: deline`
          Could not determine organization ID. Please provide an organizationId in your project configuration
          or ensure your project is properly configured in ${distroName}.
        `,
      })
    }

    // Start refresh interval if using JWT
    const api = new GardenCloudApi({
      log: cloudLog,
      domain: cloudDomain,
      organizationId,
      globalConfigStore,
      authToken,
      __trpcClientOverrideForTesting,
    })

    if (!gardenEnv.GARDEN_AUTH_TOKEN) {
      cloudFactoryLog.debug({ msg: `Starting refresh interval.` })
      api.startInterval()
    }

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
      const tokenResponse = await refreshAuthTokenAndWriteToConfigStore({
        log: this.log,
        globalConfigStore: this.globalConfigStore,
        cloudDomain: this.domain,
        refreshToken: token.refreshToken,
      })
      this.authToken = tokenResponse.accessToken
    }
  }

  async uploadDockerBuildReport(dockerBuildReport: DockerBuildReport) {
    try {
      return this.trpc.dockerBuild.create.mutate({ ...dockerBuildReport, organizationId: this.organizationId })
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
      return await this.trpc.cloudBuilder.registerBuild.mutate({
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
      return await this.trpc.actionCache.getEntry.query({
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

      throw GardenCloudTRPCError.wrapTRPCClientError(err)
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
      return await this.trpc.actionCache.createEntry.mutate({
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

      throw GardenCloudTRPCError.wrapTRPCClientError(err)
    }
  }

  async getVariables({
    importVariables,
    environmentName,
    log,
    legacyProjectId,
  }: {
    importVariables: ImportVariablesConfig
    environmentName: string
    log: Log
    legacyProjectId: string | undefined
  }) {
    const variableListIds = await this.getVariableListIds(importVariables, legacyProjectId, log)
    const reqs = variableListIds.map(async (variableListId, index) => {
      log.debug(`Fetching remote variables for variableListId=${variableListId}`)
      try {
        const result = await this.trpc.variableList.getValues.query({
          organizationId: this.organizationId,
          variableListId,
          gardenEnvironmentName: environmentName,
        })
        return { result, index, variableListId, success: true }
      } catch (error) {
        if (error instanceof TRPCClientError) {
          log.error(`Fetching variables for variable list '${variableListId}' failed with API error: ${error.message}`)
          throw GardenCloudTRPCError.wrapTRPCClientError(error)
        } else if (error instanceof Error) {
          log.error(
            `Fetching variables for variable list '${variableListId}' failed with ${error.name} error: ${error.message}`
          )
          throw error
        }

        log.error(`Fetching variables for variable list '${variableListId}' failed with unknown error.`)
        throw error
      }
    })

    const allResults = (await Promise.all(reqs)).sort((r) => r.index)

    const variables = allResults.reduce<Record<string, string>>((acc, value) => {
      for (const [key, entry] of Object.entries(value.result)) {
        acc[key] = entry.value
      }
      return acc
    }, {})

    return variables
  }

  static async getDefaultOrganizationIdForLegacyProject(
    domain: string,
    authToken: string,
    legacyProjectId: string,
    __trpcClientOverrideForTesting?: ApiTrpcClient
  ): Promise<string | undefined> {
    const tokenGetter = () => authToken
    const client = __trpcClientOverrideForTesting || getAuthenticatedApiClient({ hostUrl: domain, tokenGetter })

    try {
      const response = await client.organization.legacyGetDefaultOrganization.query({
        legacyProjectId,
      })
      return response.id ?? undefined
    } catch (error) {
      if (error instanceof TRPCClientError) {
        throw GardenCloudTRPCError.wrapTRPCClientError(error)
      }
      throw error
    }
  }

  async getVariableListIds(
    importVariables: ImportVariablesConfig,
    legacyProjectId: string | undefined,
    log: Log
  ): Promise<string[]> {
    const variableListIds = getVarlistIdsFromRemoteVarsConfig(importVariables)

    if (variableListIds.length > 0) {
      return variableListIds
    }

    if (!legacyProjectId) {
      return []
    }

    try {
      const response = await this.trpc.variableList.legacyGetDefaultProjectList.query({
        organizationId: this.organizationId,
        projectId: legacyProjectId,
      })
      log.warn(`No variable lists configured, falling back to default variable list: ${response.id}`)
      // Write a YAML snippet to help the user configure the variable list
      log.warn(dedent`
        To avoid using the default variable list (and suppress this message), you can configure remote variables in your project configuration:
        ${styles.command(
          `
  importVariables:
    - from: "garden-cloud"
      list: ${'"' + response.id + '"'}
      description: "${response.description}"
          `
        )}
      `)
      return [response.id]
    } catch (error) {
      log.info(`Could not fetch default variable list for legacy project ID ${legacyProjectId}: ${error}`)
      return []
    }
  }

  async revokeToken(clientAuthToken: ClientAuthToken, log: Log) {
    return await revokeAuthToken({ clientAuthToken, cloudDomain: this.domain, log })
  }

  @Memoize(() => true)
  async getCurrentAccount() {
    return await this.trpc.account.getCurrentAccount.query()
  }

  @Memoize(() => true)
  async getOrganization() {
    try {
      return await this.trpc.organization.getById.query({
        organizationId: this.organizationId,
      })
    } catch (err) {
      if (!(err instanceof TRPCClientError)) {
        throw err
      }

      const errorMessage = err.message.toLowerCase()

      // Handle common authorization errors with user-friendly messages
      if (errorMessage.includes("does not have access") || errorMessage.includes("not authorized")) {
        throw new CloudApiError({
          message: deline`
            You do not have access to the organization with ID ${styles.primary(this.organizationId)}.
            Please check that you are logged in with the correct account and that your organizationId is correct.
            You can find your organization ID at ${styles.link("app.garden.io")} under Settings > Organization.
            To log in with a different account, run ${styles.command("garden logout && garden login")}
          `,
        })
      }

      // Handle invalid UUID format
      if (errorMessage.includes("invalid uuid")) {
        throw new ParameterError({
          message: deline`
            The organizationId ${styles.primary(this.organizationId)} in your project configuration is not a valid UUID.
            You can find your organization ID at ${styles.link("app.garden.io")} under Settings > Organization,
            or run ${styles.command("garden logout && garden login")} to have it resolved automatically.
          `,
        })
      }

      // For other TRPC errors, wrap them properly
      throw GardenCloudTRPCError.wrapTRPCClientError(err)
    }
  }

  async getOrCreatServiceAccountAndToken({ accountId, name }: { accountId: string; name: string }) {
    return await this.trpc.account.getOrCreateServiceAccountAndToken.mutate({
      organizationId: this.organizationId,
      accountId,
      name,
    })
  }

  async getCommandRunsUrl() {
    const organization = await this.getOrganization()

    return new URL(`/${organization.slug || organization.id}/command-runs`, this.domain)
  }

  /**
   * Returns the URL to Garden Cloud command run detail for this session ID if available.
   * Returns null if a corresponding command ULID wasn't found, e.g. because no event has been sent.
   */
  async getCommandRunUrl(sessionId: string) {
    const organization = await this.getOrganization()
    const commandUlid = GrpcEventConverter.uuidToUlidMap.get(sessionId)

    if (!commandUlid) {
      return null
    }

    return new URL(`/${organization.slug || organization.id}/command-runs?id=${commandUlid}`, this.domain)
  }

  /**
   * Returns the URL to Garden Cloud action log for this action ID if available.
   * Returns null if corresponding ULIDs weren't found, e.g. because the relevant events haven't been sent.
   */
  async getActionLogUrl({ sessionId, actionUid }: { sessionId: string; actionUid: string }) {
    const organization = await this.getOrganization()
    const commandUlid = GrpcEventConverter.uuidToUlidMap.get(sessionId)
    const actionUlid = GrpcEventConverter.uuidToUlidMap.get(actionUid)

    if (!commandUlid || !actionUlid) {
      return null
    }

    return new URL(
      `/${organization.slug || organization.id}/command-runs?id=${commandUlid}&actionLogId=${actionUlid}`,
      this.domain
    )
  }

  // GRPC clients

  private get grpcTransport() {
    this.log.debug({ msg: `Using gRPC transport with URL: ${this.domain}` })
    return createGrpcTransport({
      baseUrl: this.domain,

      // Interceptors apply to all calls running through this transport.
      interceptors: [
        (next) => {
          return async (req) => {
            // Set the auth token in the request headers
            req.header.set("authorization", `token ${this.authToken}`)

            // Call the next interceptor or the actual gRPC call
            return await next(req)
          }
        },
      ],
    })
  }

  public get eventIngestionService() {
    return createClient(GardenEventIngestionService, this.grpcTransport)
  }
}
