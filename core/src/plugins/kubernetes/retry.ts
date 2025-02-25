/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import httpStatusCodes from "http-status-codes"
import { ApiException as KubernetesApiException } from "@kubernetes/client-node"
import { sleep } from "../../util/util.js"
import type { Log } from "../../logger/log-entry.js"
import { deline } from "../../util/string.js"
import { KubernetesError } from "./api.js"
import type { NodeJSErrnoException } from "../../exceptions.js"
import { InternalError, isErrnoException } from "../../exceptions.js"
import type { ErrorEvent } from "ws"
import dns from "node:dns"
import { trim } from "lodash-es"

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
  context: string,
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
      if (forceRetry || shouldRetry(err, context)) {
        retryLog = retryLog || log.createLog()
        if (usedRetries <= maxRetries) {
          const sleepMsec = minTimeoutMs + usedRetries * minTimeoutMs
          retryLog.debug(deline`
            ${context} failed with error '${err}', retrying in ${sleepMsec}ms
            (${usedRetries}/${maxRetries})
          `)
          await sleep(sleepMsec)
          return await retry(usedRetries + 1)
        } else {
          if (usedRetries === maxRetries) {
            retryLog.error(`Kubernetes API: Maximum retry count of ${maxRetries} exceeded for operation ${context}`)
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

function isWebsocketErrorEvent(err: any): err is ErrorEvent {
  if (typeof err !== "object") {
    return false
  }
  if (typeof err.message === "string" && err.error instanceof Error && err.target) {
    return true
  }
  return false
}

export function toKubernetesError(err: unknown, context: string): KubernetesError {
  if (err instanceof KubernetesError) {
    return err
  }

  let originalMessage: string | undefined
  let apiMessage: string | undefined
  let errorType: string
  let responseStatusCode: number | undefined
  let code: NodeJSErrnoException["code"] | undefined

  if (err instanceof KubernetesApiException) {
    errorType = "ApiException"
    // In case of Kubernetes Client API Exception, we do not use the err.message
    // because it contains the full body including headers.
    // We only extract the status code and kubernetes message from the body.
    try {
      const parsedBody = JSON.parse(err.body)
      if (typeof parsedBody === "object" && typeof parsedBody.message === "string") {
        apiMessage = parsedBody.message
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        apiMessage = err.body
      } else {
        throw e
      }
    }
    responseStatusCode = err.code
  } else if (isErrnoException(err)) {
    errorType = "Error"
    code = err.code
    originalMessage = err.message
  } else if (isWebsocketErrorEvent(err)) {
    errorType = "WebsocketError"
    originalMessage = err.message
    // The ErrorEvent does not expose the status code other than as part of the error.message
  } else if (err instanceof Error && err.name === "Error" && err.cause === undefined) {
    // exec auth getCredential function of kubernetes client throws plain error
    // see also https://github.com/kubernetes-client/javascript/blob/release-1.x/src/exec_auth.ts
    // TODO: fix the client to throw a more recognizable error
    errorType = "Error"
    originalMessage = trim(err.message)
  } else {
    // In all other cases, we don't know what this is, so let's just throw an InternalError
    throw InternalError.wrapError(err, `toKubernetesError encountered an unknown error during ${context}`)
  }

  let message = `Error while performing Kubernetes API operation ${context}: ${errorType}\n`

  if (originalMessage) {
    message += `\n${originalMessage}`
  }
  if (responseStatusCode) {
    message += `\nResponse status code: ${responseStatusCode}`
  }
  if (apiMessage) {
    message += `\nKubernetes Message: ${apiMessage}`
  }

  return new KubernetesError({
    message: message.trim(),
    responseStatusCode,
    code,
    apiMessage,
  })
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
export function shouldRetry(error: unknown, context: string): boolean {
  const err = toKubernetesError(error, context)

  if (err.code && errorCodesForRetry.includes(err.code)) {
    return true
  }

  if (err.responseStatusCode && statusCodesForRetry.includes(err.responseStatusCode)) {
    return true
  }

  return !!errorMessageRegexesForRetry.find((regex) => err.message.match(regex))
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

const errorCodesForRetry: NodeJSErrnoException["code"][] = ["ECONNRESET", dns.NOTFOUND]

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
  // We often flaked with this error on microk8s in the CI:
  // > pods "api-test-xxxx" is forbidden: error looking up service account container-default/default: serviceaccount "default" not found
  /forbidden: error looking up service account/,

  // We get WebsocketError without HTTP status code on some API operations, e.g. exec in a pod
  /WebsocketError/,
]
