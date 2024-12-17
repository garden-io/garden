/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TRPCClientError } from "@trpc/client"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import type { ClientAuthToken, GlobalConfigStore } from "../../config-store/global.js"
import type { Log } from "../../logger/log-entry.js"
import { apiClient } from "./trpc.js"
import { CloudApiTokenRefreshError } from "../api.js"
import { CloudApiError } from "../../exceptions.js"
import { saveAuthToken } from "../auth.js"
import { getCloudDistributionName } from "../util.js"

export function isTokenExpired(token: ClientAuthToken) {
  const now = new Date()
  return now > token.validity
}

/**
 * Checks with the backend whether the provided client auth token is valid.
 */
export async function isTokenValid({ authToken, log }: { authToken: string; log: Log }): Promise<boolean> {
  let valid = false

  try {
    log.debug(`Checking client auth token with ${getCloudDistributionName(undefined)}`)
    const verificationResult = await apiClient.token.verifyToken.query({ token: authToken })
    valid = verificationResult.valid
  } catch (err) {
    if (!(err instanceof TRPCError)) {
      throw err
    }

    const httpCode = getHTTPStatusCodeFromError(err)

    if (httpCode !== 401) {
      throw new CloudApiError({
        message: `An error occurred while verifying client auth token with ${getCloudDistributionName(undefined)}: ${err.message}`,
        responseStatusCode: httpCode,
      })
    }
  }

  log.debug(`Checked client auth token with ${getCloudDistributionName(undefined)} - valid: ${valid}`)

  return valid
}

export async function refreshAuthTokenAndWriteToConfigStore(
  log: Log,
  globalConfigStore: GlobalConfigStore,
  domain: string,
  refreshToken: string
) {
  try {
    const result = await apiClient.token.refreshToken.mutate({ refreshToken })
    await saveAuthToken(
      log,
      globalConfigStore,
      { token: result.accessToken, refreshToken: result.refreshToken, tokenValidity: result.tokenValidity },
      domain
    )

    return result
  } catch (err) {
    if (!(err instanceof TRPCClientError)) {
      throw err
    }

    log.debug({ msg: `Failed to refresh the token.` })
    throw new CloudApiTokenRefreshError({
      message: `An error occurred while verifying client auth token with ${getCloudDistributionName(undefined)}: ${err.message}`,
      responseStatusCode: err.data.httpStatus,
    })
  }
}
