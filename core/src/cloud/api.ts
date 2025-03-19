/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import ci from "ci-info"
import { GotHttpError } from "../util/http.js"
import { CloudApiError, GardenError } from "../exceptions.js"
import type { Log } from "../logger/log-entry.js"
import { gardenEnv } from "../constants.js"
import { Cookie } from "tough-cookie"
import { omit } from "lodash-es"
import { dedent, deline } from "../util/string.js"
import type {
  BaseResponse,
  CreateEphemeralClusterResponse,
  CreateProjectsForRepoResponse,
  CreateSecretRequest,
  CreateSecretResponse,
  EphemeralClusterWithRegistry,
  GetKubeconfigResponse,
  GetProfileResponse,
  GetProjectResponse,
  ListProjectsResponse,
  ListSecretsResponse,
  SecretResult as CloudApiSecretResult,
  SecretResult,
  UpdateSecretRequest,
  UpdateSecretResponse,
} from "@garden-io/platform-api-types"
import type { CommandInfo } from "../plugin-context.js"
import type { ClientAuthToken, GlobalConfigStore } from "../config-store/global.js"
import { LogLevel } from "../logger/logger.js"
import { getStoredAuthToken, saveAuthToken } from "./auth.js"
import type { StringMap } from "../config/common.js"
import { styles } from "../logger/styles.js"
import { HTTPError } from "got"
import type { Garden } from "../garden.js"
import type { ApiCommandError } from "../commands/cloud/helpers.js"
import { enumerate } from "../util/enumerate.js"
import queryString from "query-string"
import type { ApiFetchOptions } from "./http-client.js"
import { GardenCloudHttpClient } from "./http-client.js"
import { getCloudDistributionName, getCloudLogSectionName } from "./util.js"
import type { GrowCloudApiFactory } from "./grow/api.js"

export class CloudApiDuplicateProjectsError extends CloudApiError {}

export class CloudApiTokenRefreshError extends CloudApiError {}

function extractErrorMessageBodyFromGotError(error: any): error is GotHttpError {
  return error?.response?.body?.message
}

const refreshThreshold = 10 // Threshold (in seconds) subtracted to jwt validity when checking if a refresh is needed

const secretsPageLimit = 100

interface BulkOperationResult {
  results: SecretResult[]
  errors: ApiCommandError[]
}

export interface Secret {
  name: string
  value: string
}

export interface BulkCreateSecretRequest extends Omit<CreateSecretRequest, "name" | "value"> {
  secrets: Secret[]
}

export interface SingleUpdateSecretRequest extends UpdateSecretRequest {
  id: string
}

export interface BulkUpdateSecretRequest {
  secrets: SingleUpdateSecretRequest[]
}

// TODO: Read this from the `api-types` package once the session registration logic has been released in Cloud.
export interface CloudSessionResponse {
  environmentId: string
  namespaceId: string
  shortId: string
}

export interface CloudSession extends CloudSessionResponse {
  api: GardenCloudApi
  id: string
  projectId: string
}

// Represents a cloud environment
export interface CloudEnvironment {
  id: string
  name: string
}

export interface CloudOrganization {
  id: string
  name: string
}

// Represents a cloud project
export interface CloudProject {
  id: string
  name: string
  organization: CloudOrganization
  repositoryUrl: string
  environments: CloudEnvironment[]
}

export interface GetSecretsParams {
  log: Log
  projectId: string
  environmentName: string
}

function toCloudProject(project: GetProjectResponse["data"] | CreateProjectsForRepoResponse["data"][0]): CloudProject {
  const environments: CloudEnvironment[] = []

  for (const environment of project.environments) {
    environments.push({ id: environment.id, name: environment.name })
  }

  return {
    id: project.id,
    name: project.name,
    organization: { id: project.organization.id, name: project.organization.name },
    repositoryUrl: project.repositoryUrl,
    environments,
  }
}

export interface CloudApiFactoryParams {
  log: Log
  cloudDomain: string
  globalConfigStore: GlobalConfigStore
  projectId: string | undefined
  organizationId: string | undefined
  skipLogging?: boolean
}

export type GardenCloudApiFactory = (params: CloudApiFactoryParams) => Promise<GardenCloudApi | undefined>

export type CloudApiFactory = GardenCloudApiFactory | GrowCloudApiFactory

export type CloudApiParams = {
  log: Log
  domain: string
  projectId: string | undefined
  globalConfigStore: GlobalConfigStore
}

/**
 * The Garden Cloud / Enterprise API client.
 *
 * Can only be initialized if the user is actually logged in.
 */
export class GardenCloudApi {
  private intervalId: NodeJS.Timeout | null = null
  private readonly intervalMsec = 4500 // Refresh interval in ms, it needs to be less than refreshThreshold/2
  private _profile?: GetProfileResponse["data"]

  private readonly httpClient: GardenCloudHttpClient

  private projects: Map<string, CloudProject> // keyed by project ID
  private registeredSessions: Map<string, CloudSession> // keyed by session ID

  private readonly log: Log
  public readonly domain: string
  public readonly projectId: string | undefined
  public readonly distroName: string
  private readonly globalConfigStore: GlobalConfigStore

  constructor(params: CloudApiParams) {
    const { log, domain, projectId, globalConfigStore } = params
    this.log = log
    this.httpClient = new GardenCloudHttpClient(params)
    this.domain = domain
    this.projectId = projectId
    this.distroName = getCloudDistributionName({ domain, projectId })
    this.globalConfigStore = globalConfigStore
    this.projects = new Map()
    this.registeredSessions = new Map()
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
    projectId,
    globalConfigStore,
    skipLogging = false,
  }: CloudApiFactoryParams): Promise<GardenCloudApi | undefined> {
    const distroName = getCloudDistributionName({ domain: cloudDomain, projectId })
    const cloudLogSectionName = getCloudLogSectionName(distroName)
    const fixLevel = skipLogging ? LogLevel.silly : undefined
    const cloudFactoryLog = log.createLog({ fixLevel, name: cloudLogSectionName, showDuration: true })
    const cloudLog = log.createLog({ name: cloudLogSectionName })
    const successMsg = "Successfully authorized"

    cloudFactoryLog.info("Authorizing...")

    const token = await getStoredAuthToken(log, globalConfigStore, cloudDomain)
    if (!token && !gardenEnv.GARDEN_AUTH_TOKEN) {
      log.debug(
        `No auth token found, proceeding without access to ${distroName}. Command results for this command run will not be available in ${distroName}.`
      )
      return undefined
    }

    const api = new GardenCloudApi({ log: cloudLog, projectId, domain: cloudDomain, globalConfigStore })
    const tokenIsValid = await api.checkClientAuthToken()

    cloudFactoryLog.info("Authorizing...")

    if (gardenEnv.GARDEN_AUTH_TOKEN) {
      log.silly(() => "Using auth token from GARDEN_AUTH_TOKEN env var")
      // Throw if using an invalid "CI" access token
      if (!tokenIsValid) {
        throw new CloudApiError({
          message: deline`
            The provided access token is expired or has been revoked for ${cloudDomain}, please create a new
            one from the ${distroName} UI.`,
          responseStatusCode: 401,
        })
      }
    } else {
      // Refresh the token if it's invalid.
      if (!tokenIsValid) {
        cloudFactoryLog.debug({ msg: `Current auth token is invalid, refreshing` })

        // We can assert the token exists since we're not using `GARDEN_AUTH_TOKEN`
        await api.refreshToken(token!)
      }

      // Start refresh interval if using JWT
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
    const token = await this.globalConfigStore.get("clientAuthTokens", this.domain)

    if (!token || gardenEnv.GARDEN_AUTH_TOKEN) {
      this.log.debug({ msg: "Nothing to refresh, returning." })
      return
    }

    // Note: lazy-loading for startup performance
    const { sub, isAfter } = await import("date-fns")

    if (isAfter(new Date(), sub(token.validity, { seconds: refreshThreshold }))) {
      await this.refreshToken(token)
    }
  }

  private async refreshToken(token: ClientAuthToken) {
    try {
      const res = await this.get<any>("token/refresh", { headers: { Cookie: `rt=${token?.refreshToken}` } })

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
      await saveAuthToken({
        log: this.log,
        globalConfigStore: this.globalConfigStore,
        tokenResponse: tokenObj,
        domain: this.domain,
        projectId: this.projectId,
      })
    } catch (err) {
      if (!(err instanceof GotHttpError)) {
        throw err
      }

      this.log.debug({ msg: `Failed to refresh the token.` })
      throw new CloudApiTokenRefreshError({
        message: `An error occurred while verifying client auth token with ${this.getCloudDistributionName()}: ${
          err.message
        }. Response status code: ${err.response.statusCode}`,
        responseStatusCode: err.response.statusCode,
      })
    }
  }

  private getCloudDistributionName() {
    return getCloudDistributionName({ domain: this.domain, projectId: this.projectId })
  }

  sessionRegistered(id: string) {
    return this.registeredSessions.has(id)
  }

  async getProjectByName(projectName: string): Promise<CloudProject | undefined> {
    let response: ListProjectsResponse

    try {
      response = await this.get<ListProjectsResponse>(
        `/projects?name=${encodeURIComponent(projectName)}&exactMatch=true`
      )
    } catch (err) {
      throw new CloudApiError({
        message: `Failed to find Garden Cloud project by name: ${err}`,
      })
    }

    const projectList = response.data

    // Expect a single project, otherwise we fail with an error
    if (projectList.length > 1) {
      throw new CloudApiDuplicateProjectsError({
        message: deline`Found an unexpected state with multiple projects using the same name, ${projectName}.
        Please make sure there is only one project with the given name.
        Projects can be deleted through the Garden Cloud UI at ${this.domain}`,
      })
    }

    if (projectList.length === 0) {
      return undefined
    }

    return await this.getProjectById(projectList[0].id)
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

  async get<T>(path: string, opts: ApiFetchOptions = {}) {
    const { headers, retry, retryDescription, maxRetries } = opts
    return this.httpClient.apiFetch<T>(path, {
      method: "GET",
      headers: headers || {},
      retry: retry !== false, // defaults to true unless false is explicitly passed
      retryDescription,
      maxRetries,
    })
  }

  async delete<T>(path: string, opts: ApiFetchOptions = {}) {
    const { headers, retry, retryDescription, maxRetries } = opts
    return await this.httpClient.apiFetch<T>(path, {
      method: "DELETE",
      headers: headers || {},
      retry: retry !== false, // defaults to true unless false is explicitly passed
      retryDescription,
      maxRetries,
    })
  }

  async post<T>(path: string, opts: ApiFetchOptions & { body?: any } = {}) {
    const { body, headers, retry, retryDescription, maxRetries } = opts
    return this.httpClient.apiFetch<T>(path, {
      method: "POST",
      body: body || {},
      headers: headers || {},
      retry: !!retry, // defaults to false unless true is explicitly passed
      retryDescription,
      maxRetries,
    })
  }

  async put<T>(path: string, opts: ApiFetchOptions & { body?: any } = {}) {
    const { body, headers, retry, retryDescription, maxRetries } = opts
    return this.httpClient.apiFetch<T>(path, {
      method: "PUT",
      body: body || {},
      headers: headers || {},
      retry: !!retry, // defaults to false unless true is explicitly passed
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
    isDevCommand,
  }: {
    parentSessionId: string | undefined
    sessionId: string
    projectId: string
    commandInfo: CommandInfo
    localServerPort: number | undefined
    environment: string
    namespace: string
    isDevCommand: boolean
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
        isDevCommand,
        isCi: ci.isCI,
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
      if (!(err instanceof GotHttpError)) {
        throw err
      }

      // We don't want the command to fail when an error occurs in the backend during session registration.
      if (err.response.statusCode === 422) {
        const errMsg = deline`
          Session registration skipped due to mismatch between CLI and API versions. Please make sure your Garden CLI
          version is compatible with your version of ${this.distroName}.
        `
        this.log.debug(errMsg)
      } else {
        this.log.warn(`An error occurred while registering the session: ${err.message}`)
      }
      return
    }
  }

  async getProjectById(projectId: string) {
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

  async getProjectByIdOrThrow({
    projectId,
    projectName,
  }: Pick<Garden, "projectId" | "projectName">): Promise<CloudProject> {
    let project: CloudProject | undefined
    if (projectId) {
      project = await this.getProjectById(projectId)
    }
    if (!project) {
      throw new CloudApiError({
        message: `Project ${projectName} is not a ${this.getCloudDistributionName()} project`,
      })
    }
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
      this.log.debug(`Checking client auth token with ${this.getCloudDistributionName()}: ${url.href}`)

      await this.get("token/verify")

      valid = true
    } catch (err) {
      if (!(err instanceof GotHttpError)) {
        throw err
      }

      if (err.response.statusCode !== 401) {
        throw new CloudApiError({
          message: deline`
            An error occurred while verifying client auth token with ${this.getCloudDistributionName()}: ${err.message}
          `,
          responseStatusCode: err.response.statusCode,
        })
      }
    }

    this.log.debug(`Checked client auth token with ${this.getCloudDistributionName()} - valid: ${valid}`)

    return valid
  }

  getProjectUrl(projectId: string) {
    return new URL(`/projects/${projectId}`, this.domain)
  }

  getCommandResultUrl({ projectId, sessionId, shortId }: { projectId: string; sessionId: string; shortId: string }) {
    // fallback to full url if shortid is missing
    const path = shortId ? `/go/command/${shortId}` : `/projects/${projectId}/commands/${sessionId}`
    return new URL(path, this.domain)
  }

  getLivePageUrl({ shortId }: { shortId: string }) {
    const path = `/go/${shortId}`
    return new URL(path, this.domain)
  }

  getRegisteredSession(sessionId: string) {
    return this.registeredSessions.get(sessionId)
  }

  async getSecrets({ log, projectId, environmentName }: GetSecretsParams): Promise<StringMap> {
    let secrets: StringMap = {}
    const distroName = this.getCloudDistributionName()

    try {
      const res = await this.get<BaseResponse>(`/secrets/projectUid/${projectId}/env/${environmentName}`)
      secrets = res.data
    } catch (err) {
      if (!(err instanceof GotHttpError)) {
        throw err
      }
      // This happens if an environment or project does not exist
      if (err.response.statusCode === 404) {
        const errorHeaderMsg = styles.error(`Unable to read secrets from ${distroName}.`)
        const errorDetailMsg = styles.accent(dedent`
          Either the environment ${styles.accent.bold(environmentName)} does not exist in ${distroName},
          or no project matches the project ID ${styles.accent.bold(projectId)} in your project level garden.yml file.

          💡Suggestion:

          Visit ${styles.link(this.domain)} to review existing environments and projects.

          First check whether an environment with name ${environmentName} exists for this project. You
          can view the list of environments and the project ID on the project's Settings page.

          ${styles.accent.bold(
            "If the environment does not exist"
          )}, you can either create one from the Settings page or update
          the environments in your project level garden.yml config to match one that already exists.

          ${styles.accent.bold(
            "If a project with this ID does not exist"
          )}, it's likely because the ID has been changed in the
          project level garden.yml config file or the project has been deleted from ${distroName}.

          Either update the ID in the project level garden.yml config file to match one of an
          existing project or import a new project from the Projects page and replace the ID in your
          project configuration with the ID of the new project.
        `)

        log.error(dedent`
          ${errorHeaderMsg}

          ${errorDetailMsg}\n
          `)
      } else {
        throw err
      }
    }

    const emptyKeys = Object.keys(secrets).filter((key) => !secrets[key])
    if (emptyKeys.length > 0) {
      const prefix =
        emptyKeys.length === 1
          ? "The following secret key has an empty value"
          : "The following secret keys have empty values"
      log.error(`${prefix}: ${emptyKeys.sort().join(", ")}`)
    }
    return secrets
  }

  async fetchAllSecrets(projectId: string, log: Log): Promise<CloudApiSecretResult[]> {
    let page = 0
    const secrets: CloudApiSecretResult[] = []
    let hasMore = true
    while (hasMore) {
      log.debug(`Fetching page ${page}`)
      const q = queryString.stringify({ projectId, offset: page * secretsPageLimit, limit: secretsPageLimit })
      const res = await this.get<ListSecretsResponse>(`/secrets?${q}`)
      if (res.data.length === 0) {
        hasMore = false
      } else {
        secrets.push(...res.data)
        page++
      }
    }
    return secrets
  }

  async createSecret(request: CreateSecretRequest): Promise<CreateSecretResponse> {
    return await this.post<CreateSecretResponse>(`/secrets`, { body: request })
  }

  async createSecrets({ request, log }: { request: BulkCreateSecretRequest; log: Log }): Promise<BulkOperationResult> {
    const { secrets, environmentId, userId, projectId } = request

    const errors: ApiCommandError[] = []
    const results: SecretResult[] = []

    for (const [counter, { name, value }] of enumerate(secrets, 1)) {
      log.info({ msg: `Creating secrets... → ${counter}/${secrets.length}` })
      try {
        const body = { environmentId, userId, projectId, name, value }
        const res = await this.createSecret(body)
        results.push(res.data)
      } catch (err) {
        if (!(err instanceof HTTPError)) {
          throw err
        }

        // skip already existing secret and continue the loop
        if (err.response.statusCode === 409) {
          errors.push({
            identifier: name,
            message: "Secret already exists",
          })
        } else {
          throw err
        }
      }
    }

    return { results, errors }
  }

  async updateSecret(secretId: string, request: UpdateSecretRequest): Promise<UpdateSecretResponse> {
    return await this.put<UpdateSecretResponse>(`/secrets/${secretId}`, { body: request })
  }

  async updateSecrets({ request, log }: { request: BulkUpdateSecretRequest; log: Log }): Promise<BulkOperationResult> {
    const { secrets } = request

    const errors: ApiCommandError[] = []
    const results: SecretResult[] = []

    for (const [counter, secret] of enumerate(secrets, 1)) {
      log.info({ msg: `Updating secrets... → ${counter}/${secrets.length}` })
      try {
        const body = omit(secret, "id")
        const res = await this.updateSecret(secret.id, body)
        results.push(res.data)
      } catch (err) {
        if (!(err instanceof GardenError)) {
          throw err
        }
        errors.push({
          identifier: secret.name,
          message: err.message,
        })
      }
    }

    return { results, errors }
  }

  async registerCloudBuilderBuild({
    organizationId,
    ...body
  }: {
    organizationId: string
    actionName: string
    actionUid: string
    actionVersion: string
    coreSessionId: string
    platforms: string[]
    mtlsClientPublicKeyPEM: string | undefined
  }): Promise<RegisterCloudBuilderBuildResponse> {
    try {
      return await this.post<RegisterCloudBuilderBuildResponse>(
        `/organizations/${organizationId}/cloudbuilder/builds/`,
        {
          body,
        }
      )
      // TODO: error handling
    } catch (err) {
      return {
        data: {
          version: "v2",
          availability: {
            available: false,
            reason: `Failed to determine Garden Container Builder availability: ${extractErrorMessageBodyFromGotError(err) ?? err}`,
          },
        },
      }
    }
  }

  async createEphemeralCluster(): Promise<EphemeralClusterWithRegistry> {
    try {
      const response = await this.post<CreateEphemeralClusterResponse>(`/ephemeral-clusters/`)
      return response.data
    } catch (err) {
      throw new CloudApiError({
        message: `${extractErrorMessageBodyFromGotError(err) ?? "Creating an ephemeral cluster failed."}`,
      })
    }
  }

  async getKubeConfigForCluster(clusterId: string): Promise<string> {
    try {
      const response = await this.get<GetKubeconfigResponse>(`/ephemeral-clusters/${clusterId}/kubeconfig`)
      return response.data.kubeconfig
    } catch (err) {
      throw new CloudApiError({
        message: `${
          extractErrorMessageBodyFromGotError(err) ?? "Fetching the Kubeconfig for ephemeral cluster failed."
        }`,
      })
    }
  }
}

// TODO(cloudbuilder): import these from api-types
type RegisterCloudBuilderBuildResponseV2 = {
  data: {
    version: "v2"
    availability: CloudBuilderAvailabilityV2
  }
}
type UnsupportedRegisterCloudBuilderBuildResponse = {
  data: {
    version: "unsupported" // using unknown here overpowers the compound type
  }
}
type RegisterCloudBuilderBuildResponse =
  | RegisterCloudBuilderBuildResponseV2
  | UnsupportedRegisterCloudBuilderBuildResponse
export type RegisterCloudBuilderBuildResponseData = RegisterCloudBuilderBuildResponse["data"]

export type CloudBuilderAvailableV2 = {
  available: true

  buildx: {
    endpoints: {
      platform: string
      mtlsEndpoint: string
      serverCaPem: string
    }[]
    clientCertificatePem: string
    // only defined if the request did not include a "mtlsClientPublicKeyPEM"
    privateKeyPem?: string
  }
}
export type CloudBuilderNotAvailableV2 = {
  available: false
  reason: string
}
export type CloudBuilderAvailabilityV2 = CloudBuilderAvailableV2 | CloudBuilderNotAvailableV2
