/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import httpStatusCodes from "http-status-codes"
import { HttpError } from "@kubernetes/client-node"
import { sleep } from "../../util/util"
import { Log } from "../../logger/log-entry"
import { deline } from "../../util/string"
import { LogLevel } from "../../logger/logger"
import { KubernetesError } from "./api"
import requestErrors = require("request-promise/errors")

/**
 * The flag {@code forceRetry} can be used to avoid {@link shouldRetry} helper call in case if the error code
 * or the error message pattern is unknown.
 */
export type RetryOpts = { maxRetries?: number; minTimeoutMs?: number; forceRetry?: boolean }

/**
 * Helper function for retrying failed k8s API requests, using exponential backoff.
 *
 * Note: When using the Got library, don't use this helper, but instead rely on Got's built-in retry functionality.
 *
 * Only retries the request when it fails with an error that matches certain status codes and/or error
 * message contents (see the `shouldRetry` helper for details).
 *
 * The rationale here is that some errors occur because of network issues, intermittent timeouts etc.
 * and should be retried automatically.
 */
export async function requestWithRetry<R>(
  log: Log,
  description: string,
  req: () => Promise<R>,
  opts?: RetryOpts
): Promise<R> {
  const maxRetries = opts?.maxRetries ?? 5
  const minTimeoutMs = opts?.minTimeoutMs ?? 500
  const forceRetry = opts?.forceRetry ?? false
  let retryLog: Log | undefined = undefined
  const retry = async (usedRetries: number): Promise<R> => {
    try {
      return await req()
    } catch (err) {
      if (forceRetry || shouldRetry(err)) {
        retryLog = retryLog || log.createLog({ fixLevel: LogLevel.debug })
        if (usedRetries <= maxRetries) {
          const sleepMsec = minTimeoutMs + usedRetries * minTimeoutMs
          retryLog.info(deline`
            ${description} failed with error '${err.message}', retrying in ${sleepMsec}ms
            (${usedRetries}/${maxRetries})
          `)
          await sleep(sleepMsec)
          return await retry(usedRetries + 1)
        } else {
          if (usedRetries === maxRetries) {
            retryLog.info(chalk.red(`Kubernetes API: Maximum retry count exceeded`))
          }
          throw err
        }
      } else {
        throw err
      }
    }
  }
  const result = await retry(1)
  return result
}

/**
 * This helper determines whether an error thrown by a k8s API request should result in the request being retried.
 *
 * Looks for a list of matching error messages. Also checks for status codes for the following error classes:
 * - `KubernetesError` (when handling wrapped k8s API errors)
 * - `requestErrors.StatusCodeError` (when using the `request` library)
 *
 * Add more error codes / regexes / filters etc. here as needed.
 */
export function shouldRetry(err: any): boolean {
  const msg = err.message || ""
  let code: number | undefined = undefined

  if (err instanceof requestErrors.StatusCodeError || err instanceof KubernetesError || err instanceof HttpError) {
    code = err.statusCode
  }

  return (
    (code && statusCodesForRetry.includes(code)) ||
    err.code === "ECONNRESET" || // <- socket hang up
    !!errorMessageRegexesForRetry.find((regex) => msg.match(regex))
  )
}

export const statusCodesForRetry: number[] = [
  httpStatusCodes.REQUEST_TIMEOUT,
  httpStatusCodes.TOO_MANY_REQUESTS,

  httpStatusCodes.INTERNAL_SERVER_ERROR,
  httpStatusCodes.BAD_GATEWAY,
  httpStatusCodes.SERVICE_UNAVAILABLE,
  httpStatusCodes.GATEWAY_TIMEOUT,

  // Cloudflare-specific status codes
  521, // Web Server Is Down
  522, // Connection Timed Out
  524, // A Timeout Occurred
]

const errorMessageRegexesForRetry = [
  /ETIMEDOUT/,
  /ENOTFOUND/,
  /EAI_AGAIN/,
  /ECONNRESET/,
  /socket hang up/,
  // This usually isn't retryable
  // However on github actions there seems to be flakiness
  // And connections get refused temporarily only
  // So we retry those as well
  /ECONNREFUSED/,
  // This can happen if etcd is overloaded
  // (rpc error: code = ResourceExhausted desc = etcdserver: throttle: too many requests)
  /too many requests/,
  /Unable to connect to the server/,
]
