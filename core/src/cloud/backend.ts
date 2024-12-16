/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { AuthRedirectServerConfig } from "./auth.js"
import { isArray } from "lodash-es"
import { z } from "zod"
import { InternalError } from "../exceptions.js"

function getFirstValue(v: string | string[]) {
  return isArray(v) ? v[0] : v
}

export type GardenBackendConfig = { readonly cloudDomain: string }
export type AuthRedirectConfig = Pick<AuthRedirectServerConfig, "getLoginUrl" | "successUrl" | "extractAuthToken">

export interface GardenBackend {
  getAuthRedirectConfig(): AuthRedirectConfig
}

export abstract class AbstractGardenBackend implements GardenBackend {
  constructor(protected readonly config: GardenBackendConfig) {}

  abstract getAuthRedirectConfig(): AuthRedirectConfig
}

export class GardenCloudBackend extends AbstractGardenBackend {
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
}

const growCloudTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenValidity: z
    .number()
    .or(z.string())
    .transform((value) => parseInt(value.toString(), 10)),
})

export class GrowCloudBackend extends AbstractGardenBackend {
  override getAuthRedirectConfig(): AuthRedirectConfig {
    return {
      getLoginUrl: (port) => new URL(`/login?port=${port}`, this.config.cloudDomain).href,
      successUrl: `${new URL("/confirm-cli-auth", this.config.cloudDomain).href}?cliLoginSuccess=true`,
      extractAuthToken: (query) => {
        const token = growCloudTokenSchema.safeParse(query)
        if (!token.success) {
          throw new InternalError({ message: "Invalid query parameters" })
        }

        return {
          // Note that internally we use `token` as the key for the access token.
          token: token.data.accessToken,
          refreshToken: token.data.refreshToken,
          tokenValidity: token.data.tokenValidity,
        }
      },
    }
  }
}
