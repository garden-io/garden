/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { AuthRedirectServerConfig, AuthToken } from "./auth.js"
import { isArray } from "lodash-es"
import { z } from "zod"
import { InternalError } from "../exceptions.js"
import type { CloudApiFactory, GardenCloudApiFactory } from "./api.js"
import { GardenCloudApi } from "./api.js"
import type { GrowCloudApiFactory } from "./grow/api.js"
import { GrowCloudApi } from "./grow/api.js"
import type { ClientAuthToken, GlobalConfigStore } from "../config-store/global.js"
import type { Log } from "../logger/log-entry.js"
import { getBackendType } from "./util.js"
import type { ProjectConfig } from "../config/project.js"
import { renderZodError } from "../config/zod.js"
import { revokeAuthToken } from "./grow/auth.js"

function getFirstValue(v: string | string[] | undefined | null) {
  if (v === undefined || v === null) {
    return undefined
  }
  return isArray(v) ? v[0] : v
}

// TODO: Refactor all this to only provide projectId when initializing the backend v1,
// and only providing organizationId (and always a string, never undefined) when
// initializing the new backend.
export type GardenBackendConfig = {
  readonly cloudDomain: string
  readonly projectId: string | undefined
  readonly organizationId: string | undefined
}

export type AuthRedirectConfig = Pick<AuthRedirectServerConfig, "getLoginUrl" | "successUrl" | "extractAuthToken">

export type RevokeAuthTokenParams = {
  clientAuthToken: ClientAuthToken
  globalConfigStore: GlobalConfigStore
  log: Log
}

export interface GardenBackend {
  config: GardenBackendConfig
  cloudApiFactory: CloudApiFactory

  getAuthRedirectConfig(): AuthRedirectConfig

  revokeToken(params: RevokeAuthTokenParams): Promise<void>
}

export abstract class AbstractGardenBackend implements GardenBackend {
  readonly #config: GardenBackendConfig

  constructor(config: GardenBackendConfig) {
    this.#config = config
  }

  get config(): GardenBackendConfig {
    return this.#config
  }

  abstract get cloudApiFactory(): CloudApiFactory

  abstract getAuthRedirectConfig(): AuthRedirectConfig

  abstract revokeToken(params: RevokeAuthTokenParams): Promise<void>
}

export const gardenCloudTokenSchema = z.object({
  jwt: z.string().describe("JWT token"),
  rt: z.string().describe("Refresh token"),
  jwtVal: z
    .number()
    .or(z.string())
    .transform((value) => parseInt(value.toString(), 10))
    .describe("JWT token validity period"),
})

export class GardenCloudBackend extends AbstractGardenBackend {
  override get cloudApiFactory(): GardenCloudApiFactory {
    return GardenCloudApi.factory
  }

  override getAuthRedirectConfig(): AuthRedirectConfig {
    return {
      getLoginUrl: (port) => new URL(`/clilogin/${port}`, this.config.cloudDomain).href,
      successUrl: new URL("/clilogin/success", this.config.cloudDomain).href,
      extractAuthToken: (query): AuthToken => {
        const rawToken = {
          jwt: getFirstValue(query.jwt),
          rt: getFirstValue(query.rt),
          jwtVal: getFirstValue(query.jwtVal),
        }

        const token = gardenCloudTokenSchema.safeParse(rawToken)
        if (!token.success) {
          throw new InternalError({ message: `"Invalid query parameters": ${renderZodError(token.error)}` })
        }

        return {
          token: token.data.jwt,
          refreshToken: token.data.rt,
          tokenValidity: token.data.jwtVal,
        }
      },
    }
  }

  override async revokeToken({ clientAuthToken, globalConfigStore, log }: RevokeAuthTokenParams): Promise<void> {
    // NOTE: The Cloud API is missing from the `Garden` class for commands
    // with `noProject = true` so we initialize it here.
    const cloudApi = await this.cloudApiFactory({
      log,
      cloudDomain: this.config.cloudDomain,
      projectId: this.config.projectId,
      organizationId: undefined, // TODO: Remove the need for this param
      skipLogging: true,
      globalConfigStore,
    })

    if (!cloudApi) {
      return
    }

    try {
      await cloudApi.revokeToken(clientAuthToken)
    } finally {
      cloudApi.close()
    }
  }
}

export const growCloudTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenValidity: z
    .number()
    .or(z.string())
    .transform((value) => parseInt(value.toString(), 10)),
  organizationId: z.string(),
})

export class GrowCloudBackend extends AbstractGardenBackend {
  override get cloudApiFactory(): GrowCloudApiFactory {
    return GrowCloudApi.factory
  }

  override getAuthRedirectConfig(): AuthRedirectConfig {
    const addOrganizationIdParam = !!this.config.organizationId ? `&organizationId=${this.config.organizationId}` : ""
    return {
      getLoginUrl: (port) => new URL(`/login?port=${port}${addOrganizationIdParam}`, this.config.cloudDomain).href,
      successUrl: `${new URL("/confirm-cli-auth", this.config.cloudDomain).href}?cliLoginSuccess=true`,
      extractAuthToken: (query): AuthToken => {
        const token = growCloudTokenSchema.safeParse(query)
        if (!token.success) {
          throw new InternalError({ message: `"Invalid query parameters": ${renderZodError(token.error)}` })
        }

        return {
          // Note that internally we use `token` as the key for the access token.
          token: token.data.accessToken,
          refreshToken: token.data.refreshToken,
          tokenValidity: token.data.tokenValidity,
          organizationId: token.data.organizationId,
        }
      },
    }
  }

  override async revokeToken({ clientAuthToken, log }: RevokeAuthTokenParams): Promise<void> {
    await revokeAuthToken({ clientAuthToken, cloudDomain: this.config.cloudDomain, log })
  }
}

export function gardenBackendFactory(projectConfig: ProjectConfig, backendConfig: GardenBackendConfig) {
  const gardenBackendClass = getBackendType(projectConfig) === "v2" ? GrowCloudBackend : GardenCloudBackend
  return new gardenBackendClass(backendConfig)
}
