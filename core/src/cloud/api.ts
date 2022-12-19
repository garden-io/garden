/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { IncomingHttpHeaders } from "http"

import { got, GotHeaders, GotHttpError, GotJsonOptions, GotResponse } from "../util/http"
import { EnterpriseApiError } from "../exceptions"
import { LogEntry } from "../logger/log-entry"
import { gardenEnv } from "../constants"
import type { ClientAuthToken as ClientAuthTokenType } from "../db/entities/client-auth-token"
import { Cookie } from "tough-cookie"
import { isObject } from "lodash"
import { deline } from "../util/string"
import chalk from "chalk"
import {
  GetProjectResponse,
  GetProfileResponse,
  CreateProjectsForRepoResponse,
  ListProjectsResponse,
} from "@garden-io/platform-api-types"
import { getCloudDistributionName, getPackageVersion } from "../util/util"
import { CommandInfo } from "../plugin-context"
import { ProjectResource } from "../config/project"

const gardenClientName = "garden-core"
const gardenClientVersion = getPackageVersion()

// If a GARDEN_AUTH_TOKEN is present and Garden is NOT running from a workflow runner pod,
// switch to ci-token authentication method.
export const authTokenHeader =
  gardenEnv.GARDEN_AUTH_TOKEN && !gardenEnv.GARDEN_GE_SCHEDULED ? "x-ci-token" : "x-access-auth-token"

export const makeAuthHeader = (clientAuthToken: string) => ({ [authTokenHeader]: clientAuthToken })

export function isGotError(error: any, statusCode: number): error is GotHttpError {
  return error instanceof GotHttpError && error.response.statusCode === statusCode
}

function is401Error(error: any): error is GotHttpError {
  return isGotError(error, 401)
}

function stripLeadingSlash(str: string) {
  return str.replace(/^\/+/, "")
}

// This is to prevent Unhandled Promise Rejections in got
// See: https://github.com/sindresorhus/got/issues/1489#issuecomment-805485731
function isGotResponseOk(response: GotResponse) {
  const { statusCode } = response
  const limitStatusCode = response.request.options.followRedirect ? 299 : 399

  return (statusCode >= 200 && statusCode <= limitStatusCode) || statusCode === 304
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

// TODO: Read this from the `api-types` package once the session registration logic has been released in Cloud.
export interface RegisterSessionResponse {
  environmentId: number
  namespaceId: number
}

// Represents a cloud environment
export interface CloudEnvironment {
  id: number
  name: string
}

// Represents a cloud project
export interface CloudProject {
  id: number
  uid: string
  name: string
  repositoryUrl: string
  environments: CloudEnvironment[]
}

function toCloudProject(
  project: GetProjectResponse["data"] | ListProjectsResponse["data"][0] | CreateProjectsForRepoResponse["data"][0]
): CloudProject {
  const environments: CloudEnvironment[] = []

  for (const environment of project.environments) {
    environments.push({ id: environment.id, name: environment.name })
  }

  return {
    id: project.id,
    uid: project.uid,
    name: project.name,
    repositoryUrl: project.repositoryUrl,
    environments,
  }
}

/**
 * A helper function to get the cloud domain from a project config. Uses the env var
 * GARDEN_CLOUD_DOMAIN to override a configured domain.
 */
export function getGardenCloudDomain(projectConfig?: ProjectResource): string | undefined {
  if (!projectConfig) {
    return undefined
  }

  let cloudDomain: string | undefined

  if (gardenEnv.GARDEN_CLOUD_DOMAIN) {
    cloudDomain = new URL(gardenEnv.GARDEN_CLOUD_DOMAIN).origin
  } else if (projectConfig.domain) {
    cloudDomain = new URL(projectConfig.domain).origin
  }

  return cloudDomain
}

/**
 * The Enterprise API client.
 *
 * Can only be initialized if the user is actually logged in. Includes a handful of static helper methods
 * for cases where the user is not logged in (e.g. the login method itself).
 */
export class CloudApi {
  private intervalId: NodeJS.Timer | null
  private log: LogEntry
  private intervalMsec = 4500 // Refresh interval in ms, it needs to be less than refreshThreshold/2
  private apiPrefix = "api"
  private _project?: CloudProject
  private _profile?: GetProfileResponse["data"]
  public domain: string
  public projectId: string | undefined

  // Set when/if the Core session is registered with Cloud
  public environmentId?: number
  public namespaceId?: number
  public sessionRegistered = false

  constructor(log: LogEntry, enterpriseDomain: string) {
    this.log = log
    // TODO: Replace all instances of "enterpriseDomain" with "cloudDomain".
    this.domain = enterpriseDomain
  }

  /**
   * Initialize the Cloud API.
   *
   * Returns null if the project is not configured for Garden Cloud or if the user is not logged in.
   * Throws if the user is logged in but the token is invalid and can't be refreshed.
   *
   * Optionally skip logging during initialization. Useful for noProject commands that need to use the class
   * without all the "flair".
   */
  static async factory({
    log,
    cloudDomain,
    skipLogging = false,
  }: {
    log: LogEntry
    cloudDomain: string
    skipLogging?: boolean
  }) {
    log.debug("Initializing Garden Cloud API client.")

    const token = await CloudApi.getClientAuthTokenFromDb(log)
    if (!token && !gardenEnv.GARDEN_AUTH_TOKEN) {
      log.debug("User is not logged in. Aborting.")
      return null
    }

    const api = new CloudApi(log, cloudDomain)
    const tokenIsValid = await api.checkClientAuthToken()

    const distroName = getCloudDistributionName(api.domain)
    const section = distroName === "Garden Enterprise" ? "garden-enterprise" : "garden-cloud"

    const enterpriseLog = skipLogging ? null : log.info({ section, msg: "Authorizing...", status: "active" })

    if (gardenEnv.GARDEN_AUTH_TOKEN) {
      // Throw if using an invalid "CI" access token
      if (!tokenIsValid) {
        throw new EnterpriseApiError(
          deline`
            The provided access token is expired or has been revoked, please create a new
            one from the ${distroName} UI.`,
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
          in to another instance of ${distroName}, please log out first and then
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
    if (!tokenResponse.token) {
      const errMsg = deline`
        Received a null/empty client auth token while logging in. This indicates that either your user account hasn't
        yet been created in Garden Cloud, or that there's a problem with your account's VCS username / login
        credentials.
      `
      throw new EnterpriseApiError(errMsg, { tokenResponse })
    }
    try {
      // Note: lazy-loading for startup performance
      const { ClientAuthToken } = require("../db/entities/client-auth-token")
      const { add } = require("date-fns")

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
      throw new EnterpriseApiError(
        `An error occurred while saving client auth token to local config db:\n${error.message}`,
        { tokenResponse }
      )
    }
  }

  /**
   * Returns the full client auth token from the local DB.
   *
   * In the inconsistent/erroneous case of more than one auth token existing in the local store, picks the first auth
   * token and deletes all others.
   */
  static async getClientAuthTokenFromDb(log: LogEntry) {
    // Note: lazy-loading for startup performance
    const { ClientAuthToken } = require("../db/entities/client-auth-token")
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
    return (await CloudApi.getClientAuthTokenFromDb(log))?.token
  }

  /**
   * If a persisted client auth token exists, deletes it.
   */
  static async clearAuthToken(log: LogEntry) {
    // Note: lazy-loading for startup performance
    const { ClientAuthToken } = require("../db/entities/client-auth-token")

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

  /**
   * Verifies the projectId against Garden Cloud and assigns it
   * to the active API instance. Returns the project metadata or throws
   * an error if the project does not exist.
   */
  async verifyAndConfigureProject(projectId: string): Promise<CloudProject> {
    let project: CloudProject | undefined
    try {
      this.projectId = projectId
      project = await this.getProject()
    } catch (err) {
      this.projectId = undefined
      throw err
    }

    if (!project) {
      throw new EnterpriseApiError(`Garden Cloud has no project with ${projectId}`, {})
    }

    return project
  }

  async getProjectByName(projectName: string): Promise<CloudProject | undefined> {
    let response: ListProjectsResponse

    try {
      response = await this.get<ListProjectsResponse>(`/projects`)
    } catch (err) {
      this.log.debug(`Attempt to list all projects failed with ${err}`)
      throw err
    }

    if (response.status === "error") {
      this.log.debug(`Attempt to retrieve projects failed with ${response.error}`)
      throw new EnterpriseApiError(`Failed to retrieve projects for the organization`, {})
    }

    let projects: ListProjectsResponse["data"] = response.data
    let project: ListProjectsResponse["data"][0] | undefined

    project = projects.find((p) => p.name === projectName)

    if (!project) {
      return undefined
    }

    return toCloudProject(project)
  }

  async getOrCreateProject(projectName: string): Promise<CloudProject> {
    let project: CloudProject | undefined = await this.getProjectByName(projectName)

    if (!project) {
      project = await this.createProject(projectName)
    }

    // This is necessary to internally configure the project for this instance
    this._project = project
    this.projectId = project.uid

    return project
  }

  async createProject(projectName: string): Promise<CloudProject> {
    let response: CreateProjectsForRepoResponse

    try {
      const createRequest = {
        name: projectName,
        repositoryUrl: "",
        relativeProjectRootPath: "",
        importFromVcsProvider: false,
      }

      response = await this.post<CreateProjectsForRepoResponse>(`/projects/`, {
        body: createRequest,
      })
    } catch (err) {
      this.log.debug(`Create project request failed with error, ${err}`)
      throw err
    }

    if (response.status === "error" || (response.status === "success" && response.data.length !== 1)) {
      this.log.debug(`Attempt to create a project failed with ${response.error}`)
      throw new EnterpriseApiError(`Failed to create the project ${this.domain}/${projectName}`, {})
    }

    const project: CreateProjectsForRepoResponse["data"][0] = response.data[0]
    return toCloudProject(project)
  }

  private async refreshTokenIfExpired() {
    // Note: lazy-loading for startup performance
    const { ClientAuthToken } = require("../db/entities/client-auth-token")

    const token = await ClientAuthToken.findOne()

    if (!token || gardenEnv.GARDEN_AUTH_TOKEN) {
      this.log.debug({ msg: "Nothing to refresh, returning." })
      return
    }

    // Note: lazy-loading for startup performance
    const { sub, isAfter } = require("date-fns")

    if (isAfter(new Date(), sub(token.validity, { seconds: refreshThreshold }))) {
      await this.refreshToken(token)
    }
  }

  private async refreshToken(token: ClientAuthTokenType) {
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
      await CloudApi.saveAuthToken(this.log, tokenObj)
    } catch (err) {
      this.log.debug({ msg: `Failed to refresh the token.` })
      const detail = is401Error(err) ? { statusCode: err.response.statusCode } : {}
      throw new EnterpriseApiError(
        `An error occurred while verifying client auth token with ${getCloudDistributionName(this.domain)}: ${
          err.message
        }`,
        detail
      )
    }
  }

  private async apiFetch<T>(path: string, params: ApiFetchParams): Promise<ApiFetchResponse<T>> {
    const { method, headers, retry, retryDescription } = params
    this.log.silly({ msg: `Calling Cloud API with ${method} ${path}` })
    const token = await CloudApi.getAuthToken(this.log)
    // TODO add more logging details
    const requestObj = {
      method,
      headers: {
        "x-garden-client-version": gardenClientVersion,
        "x-garden-client-name": gardenClientName,
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
          (options, error, retryCount) => {
            if (error) {
              // Intentionally skipping search params in case they contain tokens or sensitive data.
              const href = options.url.origin + options.url.pathname
              const description = retryDescription || `Request`
              retryLog = retryLog || this.log.debug("")
              const statusCodeDescription = error.code ? ` (status code ${error.code})` : ``
              retryLog.setState(deline`
                ${description} failed with error ${error.message}${statusCodeDescription},
                retrying (${retryCount}/${retryLimit}) (url=${href})
              `)
            }
          },
        ],
        // See: https://github.com/sindresorhus/got/issues/1489#issuecomment-805485731
        afterResponse: [
          (response) => {
            if (isGotResponseOk(response)) {
              response.request.destroy()
            }

            return response
          },
        ],
      }
    } else {
      requestOptions.retry = 0 // Disables retry
    }

    const url = new URL(`/${this.apiPrefix}/${stripLeadingSlash(path)}`, this.domain)
    const res = await got<T>(url.href, requestOptions)

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

  async registerSession({
    sessionId,
    commandInfo,
    localServerPort,
    environment,
    namespace,
  }: {
    sessionId: string
    commandInfo: CommandInfo
    localServerPort?: number
    environment: string
    namespace: string
  }): Promise<void> {
    try {
      const body = {
        sessionId,
        commandInfo,
        localServerPort,
        projectUid: this.projectId,
        environment,
        namespace,
      }
      this.log.debug(`Registering session with Garden Cloud for ${this.projectId} in ${environment} and ${namespace}.`)
      const res: RegisterSessionResponse = await this.post("sessions", {
        body,
        retry: true,
        retryDescription: "Registering session",
      })
      this.environmentId = res.environmentId
      this.namespaceId = res.namespaceId
      this.log.debug("Successfully registered session with Garden Cloud.")
    } catch (err) {
      // We don't want the command to fail when an error occurs during session registration.
      if (isGotError(err, 422)) {
        const errMsg = deline`
          Session registration skipped due to mismatch between CLI and API versions. Please make sure your Garden CLI
          version is compatible with your version of Garden Cloud.
        `
        this.log.debug(errMsg)
      } else {
        // TODO: Reintroduce error-level warning when we're checking if the Cloud/Enterprise version is compatible with
        // the Core version.
        this.log.verbose(`An error occurred while registering the session: ${err.message}`)
      }
    }
    this.sessionRegistered = true
  }

  async getProject(): Promise<CloudProject | undefined> {
    if (!this.projectId) {
      this.log.debug(`Could not retrieve a project which has not yet been configured`)
      return
    }

    // If we are using a new project ID, retrieve again from the API
    // NOTE: If we wan't to use this with multiple project IDs we need
    // a cache supporting that + check if the remote project metadata
    // was updated.
    if (this._project && this._project.uid === this.projectId) {
      return this._project
    }

    const res = await this.get<GetProjectResponse>(`/projects/uid/${this.projectId}`)
    const project: GetProjectResponse["data"] = res.data

    this._project = toCloudProject(project)

    return this._project
  }

  async getProfile() {
    if (this._profile) {
      return this._profile
    }

    const res = await this.get<GetProfileResponse>(`/profile`)
    this._profile = res.data
    return this._profile
  }

  /**
   * Checks with the backend whether the provided client auth token is valid.
   */
  async checkClientAuthToken(): Promise<boolean> {
    let valid = false
    try {
      const url = new URL("/token/verify", this.domain)
      this.log.debug(`Checking client auth token with ${getCloudDistributionName(this.domain)}: ${url.href}`)
      await this.get("token/verify")
      valid = true
    } catch (err) {
      if (!is401Error(err)) {
        throw new EnterpriseApiError(
          `An error occurred while verifying client auth token with ${getCloudDistributionName(this.domain)}: ${
            err.message
          }`,
          {}
        )
      }
    }
    this.log.debug(`Checked client auth token with ${getCloudDistributionName(this.domain)} - valid: ${valid}`)
    return valid
  }
}
