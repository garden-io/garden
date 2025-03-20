/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CreateTRPCClient, TRPCClientError, TRPCClientErrorBase, TRPCLink } from "@trpc/client"
import { createTRPCClient, httpLink, loggerLink } from "@trpc/client"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import { observable } from "@trpc/server/observable"
import superjson from "superjson"
import { z } from "zod"
import type { AppRouter } from "./trpc-schema.js"
import { GardenError } from "../../exceptions.js"
import { styles } from "../../logger/styles.js"
import { getRootLogger } from "../../logger/logger.js"
import { getCloudLogSectionName } from "../util.js"

const errorMetaSchema = z.object({ response: z.object({ status: z.number() }) })
type ErrorMeta = z.infer<typeof errorMetaSchema>

class GrowCloudError extends GardenError implements TRPCClientErrorBase<never> {
  readonly type = "garden-cloud-v2-error"
  readonly meta: ErrorMeta | undefined
  override readonly cause: TRPCClientError<never>
  readonly shape = undefined as never
  readonly data = undefined as never

  constructor({ cause, meta }: { cause: TRPCClientError<never>; meta: ErrorMeta | undefined }) {
    let message: string
    if (meta?.response.status === 401) {
      message = `Authentication required; please log in with ${styles.highlight("garden login")} and retry.`
    } else {
      message = cause.message
    }
    super({
      message,
    })
    this.meta = meta
    this.cause = cause
  }
}

export type RouterOutput = inferRouterOutputs<AppRouter>
export type RouterInput = inferRouterInputs<AppRouter>

export type DockerBuildReport = RouterInput["dockerBuild"]["create"]

export type RegisterCloudBuildRequest = RouterInput["cloudBuilder"]["registerBuild"]
export type RegisterCloudBuildResponse = RouterOutput["cloudBuilder"]["registerBuild"]

export const errorLogger: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const log = getRootLogger().createLog({ name: getCloudLogSectionName("Garden Cloud V2"), origin: "trpc" })
      log.debug(`tRPC ${op.type}: ${op.path}`)
      const unsubscribe = next(op).subscribe({
        next(value) {
          observer.next(value)
        },
        error(err) {
          const meta = errorMetaSchema.safeParse(err.meta)
          const growErr = new GrowCloudError({
            meta: meta.data,
            cause: err,
          })
          // Errors are handled by the caller, but we do log them here just in case at the debug level.
          log.debug(growErr.message)
          observer.error(growErr)
        },
        complete() {
          observer.complete()
        },
      })
      return unsubscribe
    })
  }
}

function cloudApiUrl(hostUrl: string): string {
  return new URL("/api", hostUrl).href
}

export type TrpcConfigParams = { hostUrl: string; tokenGetter: (() => string) | undefined }

function getTrpcConfig({ hostUrl, tokenGetter }: TrpcConfigParams) {
  return {
    links: [
      errorLogger,
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
