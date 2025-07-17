/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { AuthRedirectServerConfig } from "./legacy/auth.js"
import type { CloudApiFactory } from "./legacy/api.js"
import type { ClientAuthToken, GlobalConfigStore } from "../config-store/global.js"
import type { Log } from "../logger/log-entry.js"

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
