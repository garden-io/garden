/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z } from "zod"
import { TRPCClientError } from "@trpc/client"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import type { ClientAuthToken, GlobalConfigStore } from "../../config-store/global.js"
import type { Log } from "../../logger/log-entry.js"
import type { ApiTrpcClient } from "./trpc.js"
import { describeTRPCClientError, getNonAuthenticatedApiClient } from "./trpc.js"
import { CloudApiTokenRefreshError } from "../api-legacy/api.js"
import { CloudApiError, InternalError } from "../../exceptions.js"
import { clearAuthToken, saveAuthToken } from "../api-legacy/auth.js"
import { getCloudDistributionName } from "../util.js"
import dedent from "dedent"
import { handleServerNotices } from "./notices.js"
import { GardenCloudTRPCError } from "./api.js"
import type { AuthRedirectConfig, AuthToken } from "../common.js"
import { renderZodError } from "../../config/zod.js"

export function isTokenExpired(token: ClientAuthToken) {
  const now = new Date()
  return now > token.validity
}

const growCloudTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenValidity: z
    .number()
    .or(z.string())
    .transform((value) => parseInt(value.toString(), 10)),
  organizationId: z.string(),
})

export function getAuthRedirectConfig({
  cloudDomain,
  organizationId,
}: {
  cloudDomain: string
  organizationId?: string
}): AuthRedirectConfig {
  const addOrganizationIdParam = !!organizationId ? `&organizationId=${organizationId}` : ""
  return {
    getLoginUrl: (port) => new URL(`/login?port=${port}${addOrganizationIdParam}`, cloudDomain).href,
    successUrl: `${new URL("/confirm-cli-auth", cloudDomain).href}?cliLoginSuccess=true`,
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

/**
 * Checks with the new backend whether the provided client auth token is valid.
 */
export async function isTokenValid({
  authToken,
  cloudDomain,
  log,
  __trpcClientOverrideForTesting,
}: {
  authToken: string
  cloudDomain: string
  log: Log
  __trpcClientOverrideForTesting?: ApiTrpcClient
}): Promise<boolean> {
  try {
    log.debug(`Checking client auth token with ${getCloudDistributionName(cloudDomain)}`)
    const client = __trpcClientOverrideForTesting || getNonAuthenticatedApiClient({ hostUrl: cloudDomain })
    const verificationResult = await client.token.verifyToken.query({
      token: authToken,
    })

    handleServerNotices(verificationResult.notices, log)

    const tokenValid = verificationResult.valid
    log.debug(`Checked client auth token with ${getCloudDistributionName(cloudDomain)} - valid: ${tokenValid}`)
    return tokenValid
  } catch (err) {
    // TODO: check whether it can be a TRPCError, and not a TRPCClientError;
    //  this might be a dead-code branch, keeping here for compatibility
    if (err instanceof TRPCError) {
      const httpCode = getHTTPStatusCodeFromError(err)

      if (httpCode !== 401) {
        throw new CloudApiError({
          message: `An error occurred while verifying client auth token with ${getCloudDistributionName(cloudDomain)}: ${err.message}`,
          responseStatusCode: httpCode,
        })
      }
    }

    if (err instanceof TRPCClientError) {
      const errorDesc = describeTRPCClientError(err)
      log.debug(errorDesc.detailed)
      throw new GardenCloudTRPCError({
        message: `An error occurred while verifying client auth token with ${getCloudDistributionName(cloudDomain)}: ${errorDesc.short}`,
        cause: err,
      })
    }

    throw err
  }
}

export async function refreshAuthTokenAndWriteToConfigStore({
  log,
  globalConfigStore,
  cloudDomain,
  refreshToken,
  __trpcClientOverrideForTesting,
}: {
  log: Log
  globalConfigStore: GlobalConfigStore
  cloudDomain: string
  refreshToken: string
  __trpcClientOverrideForTesting?: ApiTrpcClient
}) {
  try {
    const client = __trpcClientOverrideForTesting || getNonAuthenticatedApiClient({ hostUrl: cloudDomain })
    const result = await client.token.refreshToken.mutate({
      refreshToken,
    })

    handleServerNotices(result.notices, log)

    await saveAuthToken({
      log,
      globalConfigStore,
      tokenResponse: {
        token: result.accessToken,
        refreshToken: result.refreshToken,
        tokenValidity: result.tokenValidity,
      },
      domain: cloudDomain,
    })

    return result
  } catch (err) {
    if (!(err instanceof TRPCClientError)) {
      throw err
    }

    log.debug({ msg: `Failed to refresh the token.` })

    const errHttpStatusCode = err.data?.httpStatus
    if (errHttpStatusCode === 401) {
      await clearAuthToken(log, globalConfigStore, cloudDomain)
      log.debug("Invalid refresh token was removed from the configuration store.")
    }

    const errorDesc = describeTRPCClientError(err)
    log.debug(errorDesc.detailed)
    throw new CloudApiTokenRefreshError({
      message: dedent`An error occurred while refreshing client auth token with ${getCloudDistributionName(cloudDomain)}: ${errorDesc.short}
        Please try again.
        `,
      responseStatusCode: errHttpStatusCode,
    })
  }
}

export async function revokeAuthToken({
  clientAuthToken,
  cloudDomain,
  log,
}: {
  clientAuthToken: ClientAuthToken
  cloudDomain: string
  log: Log
}) {
  try {
    await getNonAuthenticatedApiClient({ hostUrl: cloudDomain }).token.revokeToken.mutate({
      token: clientAuthToken.token,
    })
  } catch (err) {
    if (!(err instanceof TRPCClientError)) {
      throw err
    }

    log.debug({ msg: `Failed to revoke the token.` })

    const errorDesc = describeTRPCClientError(err)
    log.debug(errorDesc.detailed)
    throw new CloudApiTokenRefreshError({
      message: `An error occurred while revoking client auth token with ${getCloudDistributionName(cloudDomain)}: ${errorDesc.short}`,
    })
  }
}
