/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenCloudApiFactory } from "./api.js"
import { GardenCloudApi } from "./api.js"
import type { AuthToken } from "./auth.js"
import { InternalError } from "../../exceptions.js"
import { renderZodError } from "../../config/zod.js"
import { isArray } from "lodash-es"
import { z } from "zod"
import type { AuthRedirectConfig, RevokeAuthTokenParams } from "../backend-base.js"
import { AbstractGardenBackend } from "../backend-base.js"

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

function getFirstValue(v: string | string[] | undefined | null) {
  if (v === undefined || v === null) {
    return undefined
  }
  return isArray(v) ? v[0] : v
}
