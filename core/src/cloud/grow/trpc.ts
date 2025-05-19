/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CreateTRPCClient, TRPCClientError } from "@trpc/client"
import { createTRPCClient, httpLink, loggerLink } from "@trpc/client"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import superjson from "superjson"
import type { AppRouter } from "./trpc-schema.js"
import { getPackageVersion } from "../../util/util.js"
import type { InferrableClientTypes } from "@trpc/server/unstable-core-do-not-import"
import { isError } from "lodash-es"

export type RouterOutput = inferRouterOutputs<AppRouter>
export type RouterInput = inferRouterInputs<AppRouter>

/**
 * Wrapper type for request parameters of the methods of the class {@link GrowCloudApi}.
 *
 * Client code should not inject `organizationId` values explicitly.
 * The `organizationId` is already known and stored in the {@link GrowCloudApi} class,
 * so the class should use that value to compose tRPC request payloads.
 */
export type ClientRequest<T extends { organizationId?: string | undefined }> = Omit<T, "organizationId">

export type DockerBuildReport = ClientRequest<RouterInput["dockerBuild"]["create"]>

export type RegisterCloudBuildRequest = ClientRequest<RouterInput["cloudBuilder"]["registerBuild"]>
export type RegisterCloudBuildResponse = RouterOutput["cloudBuilder"]["registerBuild"]

export type GetActionResultRequest = ClientRequest<RouterInput["actionCache"]["getEntry"]>
export type GetActionResultResponse = RouterOutput["actionCache"]["getEntry"]

export type CreateActionResultRequest = ClientRequest<RouterInput["actionCache"]["createEntry"]>
export type CreateActionResultResponse = RouterOutput["actionCache"]["createEntry"]

function cloudApiUrl(hostUrl: string): string {
  return new URL("/api", hostUrl).href
}

export type TrpcConfigParams = { hostUrl: string; tokenGetter: (() => string) | undefined }

function getTrpcConfig({ hostUrl, tokenGetter }: TrpcConfigParams) {
  return {
    links: [
      loggerLink({
        enabled: () => false,
      }),
      httpLink({
        transformer: superjson,
        url: cloudApiUrl(hostUrl),
        fetch: async (url, options) => {
          // TODO @eysi: Error handling + retries
          const headers = new Headers(options?.headers)

          // We need to get the token for each request since a given token is only valid for a short period of time
          if (tokenGetter) {
            headers.set("Authorization", `token ${tokenGetter()}`)
          }

          headers.set("x-client-name", "garden-core")
          headers.set("x-client-version", getPackageVersion())

          // Use standard fetch instead of bunFetch from Grow
          return await fetch(url, { ...options, headers })
        },
      }),
    ],
  }
}

export function getAuthenticatedApiClient(trpcConfigParams: TrpcConfigParams) {
  return createTRPCClient<AppRouter>(getTrpcConfig(trpcConfigParams))
}

export function getNonAuthenticatedApiClient(trpcConfigParams: Omit<TrpcConfigParams, "tokenGetter">) {
  return createTRPCClient<AppRouter>(getTrpcConfig({ ...trpcConfigParams, tokenGetter: undefined }))
}

export type ApiClient = CreateTRPCClient<AppRouter>

export function isAggregateError(err: Error): err is AggregateError {
  return err.constructor.name === "AggregateError"
}

type ErrorCause = { type: string; msg: string }

export function getErrorCauseChain(err: TRPCClientError<InferrableClientTypes>): ErrorCause[] {
  const errorCauses: ErrorCause[] = []

  let currentError: Error | undefined = err
  while (currentError !== undefined) {
    const errorType = currentError.constructor.name
    const errorMsg = isAggregateError(currentError)
      ? currentError.errors
          .map((e) => (isError(e) ? e.message : ""))
          .filter((m) => !!m)
          .join("; ")
      : currentError.message

    errorCauses.push({ type: errorType, msg: errorMsg })

    if (isError(currentError.cause)) {
      currentError = currentError.cause
    } else {
      currentError = undefined
    }
  }

  return errorCauses
}

type TRPCErrorDesc = {
  short: string
  detailed: () => string
}

/**
 * Collects deduplicated chain of error messages.
 *
 * @param errorCauses the list of the errors
 */
function getShortDesc(errorCauses: ErrorCause[]): string {
  const errorMessages = new Set<string>()
  for (const errorCause of errorCauses) {
    errorMessages.add(errorCause.msg)
  }
  return [...errorMessages].join(": ")
}

/**
 * Collects the actual chain of error messages with the corresponding constructor names.
 *
 * @param errorCauses the list of the errors
 */
function getDetailedDesc(errorCauses: ErrorCause[]): string {
  const errorMessages: string[] = []
  for (const errorCause of errorCauses) {
    errorMessages.push(`${errorCause.type}: ${errorCause.msg}`)
  }
  return errorMessages.join("; caused by: ")
}

export function describeTRPCClientError(err: TRPCClientError<InferrableClientTypes>): TRPCErrorDesc {
  const errorCauses = getErrorCauseChain(err)
  return {
    short: getShortDesc(errorCauses),
    detailed: () => getDetailedDesc(errorCauses),
  }
}
