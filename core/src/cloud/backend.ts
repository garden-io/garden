/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { AuthRedirectServerConfig } from "./auth.js"
import { isArray } from "lodash-es"
import { z } from "zod"
import { InternalError } from "../exceptions.js"
import type { CloudApiFactory, GardenCloudApiFactory } from "./api.js"
import { GardenCloudApi } from "./api.js"
import type { GrowCloudApiFactory } from "./grow/api.js"
import { GrowCloudApi } from "./grow/api.js"
import type { ClientAuthToken, GlobalConfigStore } from "../config-store/global.js"
import type { Log } from "../logger/log-entry.js"
import { getNonAuthenticatedApiClient } from "./grow/trpc.js"
import { getBackendType } from "./util.js"
import type { ProjectConfig } from "../config/project.js"

function getFirstValue(v: string | string[]) {
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

export class GardenCloudBackend extends AbstractGardenBackend {
  override get cloudApiFactory(): GardenCloudApiFactory {
    return GardenCloudApi.factory
  }

  override getAuthRedirectConfig(): AuthRedirectConfig {
    return {
      getLoginUrl: (port) => new URL(`/clilogin/${port}`, this.config.cloudDomain).href,
      successUrl: new URL("/clilogin/success", this.config.cloudDomain).href,
      extractAuthToken: (query) => {
        const { jwt, rt, jwtval } = query
        // TODO: validate properly
        return {
          token: getFirstValue(jwt!),
          refreshToken: getFirstValue(rt!),
          tokenValidity: parseInt(getFirstValue(jwtval!), 10),
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
      await cloudApi.post("token/logout", { headers: { Cookie: `rt=${clientAuthToken?.refreshToken}` } })
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
    return {
      getLoginUrl: (port) => new URL(`/login?port=${port}`, this.config.cloudDomain).href,
      successUrl: `${new URL("/confirm-cli-auth", this.config.cloudDomain).href}?cliLoginSuccess=true`,
      extractAuthToken: (query) => {
        const token = growCloudTokenSchema.safeParse(query)
        if (!token.success) {
          // TODO: Better error handling
          throw new InternalError({ message: "Invalid query parameters" })
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

  override async revokeToken({ clientAuthToken }: RevokeAuthTokenParams): Promise<void> {
    await getNonAuthenticatedApiClient({ hostUrl: this.config.cloudDomain }).token.revokeToken.mutate({
      token: clientAuthToken.token,
    })
  }
}

export function gardenBackendFactory(projectConfig: ProjectConfig, backendConfig: GardenBackendConfig) {
  const gardenBackendClass = getBackendType(projectConfig) === "v2" ? GrowCloudBackend : GardenCloudBackend
  return new gardenBackendClass(backendConfig)
}
