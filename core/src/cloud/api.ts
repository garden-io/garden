/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { IncomingHttpHeaders } from "http"

import { got, GotHeaders, GotHttpError, GotJsonOptions, GotResponse } from "../util/http"
import { CloudApiError } from "../exceptions"
import { Log } from "../logger/log-entry"
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../constants"
import { Cookie } from "tough-cookie"
import { isObject } from "lodash"
import { deline } from "../util/string"
import {
  GetProjectResponse,
  GetProfileResponse,
  CreateProjectsForRepoResponse,
  ListProjectsResponse,
} from "@garden-io/platform-api-types"
import { getCloudDistributionName, getCloudLogSectionName, getPackageVersion } from "../util/util"
import { CommandInfo } from "../plugin-context"
import type { ClientAuthToken, GlobalConfigStore } from "../config-store/global"
import { add } from "date-fns"
import { LogLevel } from "../logger/logger"
import { makeAuthHeader } from "./auth"

const gardenClientName = "garden-core"
const gardenClientVersion = getPackageVersion()

export class CloudApiDuplicateProjectsError extends CloudApiError {}
export class CloudApiTokenRefreshError extends CloudApiError {}

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
export interface CloudSessionResponse {
  environmentId: number
  namespaceId: number
  shortId: string
}

export interface CloudSession extends CloudSessionResponse {
  api: CloudApi
  id: string
  projectId: string
}

// Represents a cloud environment
export interface CloudEnvironment {
  id: string
  name: string
}

// Represents a cloud project
export interface CloudProject {
  id: string
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
    name: project.name,
    repositoryUrl: project.repositoryUrl,
    environments,
  }
}

/**
 * A helper function to get the cloud domain from a project config. Uses the env var
 * GARDEN_CLOUD_DOMAIN to override a configured domain.
 */
export function getGardenCloudDomain(configuredDomain: string | undefined): string {
  let cloudDomain: string | undefined

  if (gardenEnv.GARDEN_CLOUD_DOMAIN) {
    cloudDomain = new URL(gardenEnv.GARDEN_CLOUD_DOMAIN).origin
  } else if (configuredDomain) {
    cloudDomain = new URL(configuredDomain).origin
  }

  return cloudDomain || DEFAULT_GARDEN_CLOUD_DOMAIN
}

export interface CloudApiFactoryParams {
  log: Log
  cloudDomain: string
  globalConfigStore: GlobalConfigStore
  skipLogging?: boolean
}

/**
 * The Enterprise API client.
 *
 * Can only be initialized if the user is actually logged in. Includes a handful of static helper methods
 * for cases where the user is not logged in (e.g. the login method itself).
 */
export class CloudApi {
  private intervalId: NodeJS.Timer | null
  private intervalMsec = 4500 // Refresh interval in ms, it needs to be less than refreshThreshold/2
  private apiPrefix = "api"
  private _profile?: GetProfileResponse["data"]

  private projects: Map<string, CloudProject> // keyed by project ID
  private registeredSessions: Map<string, CloudSession> // keyed by session ID

  private log: Log
  public readonly domain: string
  public readonly distroName: string
  private globalConfigStore: GlobalConfigStore

  constructor({ log, domain, globalConfigStore }: { log: Log; domain: string; globalConfigStore: GlobalConfigStore }) {
    this.log = log
    this.domain = domain
    this.distroName = getCloudDistributionName(domain)
    this.globalConfigStore = globalConfigStore
    this.projects = new Map()
    this.registeredSessions = new Map()
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
  static async factory({ log, cloudDomain, globalConfigStore, skipLogging = false }: CloudApiFactoryParams) {
    const distroName = getCloudDistributionName(cloudDomain)
    const fixLevel = skipLogging ? LogLevel.silly : undefined
    const cloudFactoryLog = log.createLog({ fixLevel, name: getCloudLogSectionName(distroName), showDuration: true })

    cloudFactoryLog.debug("Initializing Garden Cloud API client.")

    const token = await CloudApi.getStoredAuthToken(log, globalConfigStore, cloudDomain)

    if (!token && !gardenEnv.GARDEN_AUTH_TOKEN) {
      log.debug(
        `No auth token found, proceeding without access to ${distroName}. Command results for this command run will not be available in ${distroName}.`
      )
      return
    }

    const api = new CloudApi({ log, domain: cloudDomain, globalConfigStore })
    const tokenIsValid = await api.checkClientAuthToken()

    cloudFactoryLog.debug("Authorizing...")

    if (gardenEnv.GARDEN_AUTH_TOKEN) {
      // Throw if using an invalid "CI" access token
      if (!tokenIsValid) {
        throw new CloudApiError(
          deline`
            The provided access token is expired or has been revoked, please create a new
            one from the ${distroName} UI.`,
          {}
        )
      }
    } else {
      // Refresh the token if it's invalid.
      if (!tokenIsValid) {
        cloudFactoryLog.debug({ msg: `Current auth token is invalid, refreshing` })

        // We can assert the token exists since we're not using GARDEN_AUTH_TOKEN
        await api.refreshToken(token!)
      }

      // Start refresh interval if using JWT
      cloudFactoryLog.debug({ msg: `Starting refresh interval.` })
      api.startInterval()
    }

    return api
  }

  static async saveAuthToken(
    log: Log,
    globalConfigStore: GlobalConfigStore,
    tokenResponse: AuthTokenResponse,
    domain: string
  ) {
    const distroName = getCloudDistributionName(domain)

    if (!tokenResponse.token) {
      const errMsg = deline`
        Received a null/empty client auth token while logging in. This indicates that either your user account hasn't
        yet been created in ${distroName}, or that there's a problem with your account's VCS username / login
        credentials.
      `
      throw new CloudApiError(errMsg, { tokenResponse })
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
      throw new CloudApiError(
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
  static async getStoredAuthToken(log: Log, globalConfigStore: GlobalConfigStore, domain: string) {
    log.silly(`Retrieving client auth token from config store`)
    return globalConfigStore.get("clientAuthTokens", domain)
  }

  /**
   * If a persisted client auth token was found, or if the GARDEN_AUTH_TOKEN environment variable is present,
   * returns it. Returns null otherwise.
   *
   * Note that the GARDEN_AUTH_TOKEN environment variable takes precedence over a persisted auth token if both are
   * present.
   */
  static async getAuthToken(
    log: Log,
    globalConfigStore: GlobalConfigStore,
    domain: string
  ): Promise<string | undefined> {
    const tokenFromEnv = gardenEnv.GARDEN_AUTH_TOKEN
    if (tokenFromEnv) {
      log.silly("Read client auth token from env")
      return tokenFromEnv
    }
    return (await CloudApi.getStoredAuthToken(log, globalConfigStore, domain))?.token
  }

  /**
   * If a persisted client auth token exists, deletes it.
   */
  static async clearAuthToken(log: Log, globalConfigStore: GlobalConfigStore, domain: string) {
    await globalConfigStore.delete("clientAuthTokens", domain)
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

  sessionRegistered(id: string) {
    return this.registeredSessions.has(id)
  }

  async getAllProjects(): Promise<CloudProject[]> {
    let response: ListProjectsResponse

    try {
      response = await this.get<ListProjectsResponse>(`/projects`)
    } catch (err) {
      this.log.debug(`Attempt to list all projects failed with ${err}`)
      throw err
    }

    let projectList: ListProjectsResponse["data"] = response.data

    return projectList.map((p) => {
      const project = toCloudProject(p)
      // Cache the entry by ID
      this.projects.set(project.id, project)
      return project
    })
  }

  async getProjectByName(projectName: string): Promise<CloudProject | undefined> {
    const allProjects = await this.getAllProjects()

    const projects = allProjects.filter((p) => p.name === projectName)

    // Expect a single project, otherwise we fail with an error
    if (projects.length > 1) {
      throw new CloudApiDuplicateProjectsError(
        deline`Found an unexpected state with multiple projects using the same name, ${projectName}.
        Please make sure there is only one project with the given name.
        Projects can be deleted through the Garden Cloud UI at ${this.domain}`,
        {}
      )
    }

    return projects[0]
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

    const project: CreateProjectsForRepoResponse["data"][0] = response.data[0]
    return toCloudProject(project)
  }

  async getOrCreateProjectByName(projectName: string): Promise<CloudProject> {
    let project: CloudProject | undefined = await this.getProjectByName(projectName)

    if (!project) {
      project = await this.createProject(projectName)
    }

    return project
  }

  private async refreshTokenIfExpired() {
    const token = await this.globalConfigStore.get("clientAuthTokens", this.domain)

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
      await CloudApi.saveAuthToken(this.log, this.globalConfigStore, tokenObj, this.domain)
    } catch (err) {
      this.log.debug({ msg: `Failed to refresh the token.` })
      const detail = is401Error(err) ? { statusCode: err.response.statusCode } : {}
      throw new CloudApiTokenRefreshError(
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
    const token = await CloudApi.getAuthToken(this.log, this.globalConfigStore, this.domain)
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
      let retryLog: Log | undefined = undefined
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
              retryLog = retryLog || this.log.createLog({ fixLevel: LogLevel.debug })
              const statusCodeDescription = error.code ? ` (status code ${error.code})` : ``
              retryLog.info(deline`
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
      throw new CloudApiError(`Unexpected API response`, {
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
    parentSessionId,
    sessionId,
    projectId,
    commandInfo,
    localServerPort,
    environment,
    namespace,
  }: {
    parentSessionId: string | undefined
    sessionId: string
    projectId: string
    commandInfo: CommandInfo
    localServerPort?: number
    environment: string
    namespace: string
  }): Promise<CloudSession | undefined> {
    let session = this.registeredSessions.get(sessionId)

    if (session) {
      return session
    }

    try {
      const body = {
        sessionId,
        parentSessionId,
        commandInfo,
        localServerPort,
        projectUid: projectId,
        environment,
        namespace,
      }
      this.log.debug(`Registering session with ${this.distroName} for ${projectId} in ${environment}/${namespace}.`)
      const res: CloudSessionResponse = await this.post("sessions", {
        body,
        retry: true,
        retryDescription: "Registering session",
      })
      this.log.debug(`Successfully registered session with ${this.distroName}.`)

      session = { api: this, id: sessionId, projectId, ...res }
      this.registeredSessions.set(sessionId, session)
      return session
    } catch (err) {
      // We don't want the command to fail when an error occurs during session registration.
      if (isGotError(err, 422)) {
        const errMsg = deline`
          Session registration skipped due to mismatch between CLI and API versions. Please make sure your Garden CLI
          version is compatible with your version of ${this.distroName}.
        `
        this.log.debug(errMsg)
      } else {
        // TODO: Reintroduce error-level warning when we're checking if the Cloud/Enterprise version is compatible with
        // the Core version.
        this.log.verbose(`An error occurred while registering the session: ${err.message}`)
      }
      return
    }
  }

  async getProjectById(projectId: string): Promise<CloudProject | undefined> {
    const existing = this.projects.get(projectId)

    if (existing) {
      return existing
    }

    const res = await this.get<GetProjectResponse>(`/projects/uid/${projectId}`)
    const projectData: GetProjectResponse["data"] = res.data

    const project = toCloudProject(projectData)

    this.projects.set(projectId, project)

    return project
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
        throw new CloudApiError(
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

  getProjectUrl(projectId: string) {
    return new URL(`/projects/${projectId}`, this.domain)
  }

  getCommandResultUrl({
    projectId,
    sessionId,
    userId,
    shortId,
  }: {
    projectId: string
    sessionId: string
    userId: string
    shortId?: string
  }) {
    let path = `/projects/${projectId}?sessionId=${sessionId}&userId=${userId}`
    if (shortId) {
      path = `/go/${shortId}`
    }
    return new URL(path, this.domain)
  }

  getRegisteredSession(sessionId: string) {
    return this.registeredSessions.get(sessionId)
  }
}
