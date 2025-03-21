/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CreateTRPCClient } from "@trpc/client"
import { createTRPCClient, httpLink, loggerLink } from "@trpc/client"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import superjson from "superjson"
import type { AppRouter } from "./trpc-schema.js"

export type RouterOutput = inferRouterOutputs<AppRouter>
export type RouterInput = inferRouterInputs<AppRouter>

export type DockerBuildReport = RouterInput["dockerBuild"]["create"]

export type RegisterCloudBuildRequest = RouterInput["cloudBuilder"]["registerBuild"]
export type RegisterCloudBuildResponse = RouterOutput["cloudBuilder"]["registerBuild"]

export type GetActionResultRequest = RouterInput["actionCache"]["getEntry"]
export type GetActionResultResponse = RouterOutput["actionCache"]["getEntry"]

export type CreateActionResultRequest = RouterInput["actionCache"]["createEntry"]
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
