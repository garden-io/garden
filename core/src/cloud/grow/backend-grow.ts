/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z } from "zod"
import type { GrowCloudApiFactory } from "./api.js"
import { GrowCloudApi } from "./api.js"
import type { AuthToken } from "../legacy/auth.js"
import { InternalError } from "../../exceptions.js"
import { renderZodError } from "../../config/zod.js"
import { revokeAuthToken } from "./auth.js"
import type { AuthRedirectConfig, RevokeAuthTokenParams } from "../backend.js"
import { AbstractGardenBackend } from "../backend.js"

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
