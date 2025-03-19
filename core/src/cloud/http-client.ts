/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { IncomingHttpHeaders } from "http"
import type { GotHeaders, GotJsonOptions, GotResponse } from "../util/http.js"
import { got } from "../util/http.js"
import { CloudApiError } from "../exceptions.js"
import type { Log } from "../logger/log-entry.js"
import { isObject } from "lodash-es"
import { dedent, deline } from "../util/string.js"
import { getPackageVersion } from "../util/util.js"
import type { GlobalConfigStore } from "../config-store/global.js"
import { LogLevel } from "../logger/logger.js"
import { getAuthToken, makeAuthHeader } from "./auth.js"
import { RequestError } from "got"
import { getCloudDistributionName } from "./util.js"

const gardenClientName = "garden-core"
const gardenClientVersion = getPackageVersion()

export interface ApiFetchParams {
  headers: GotHeaders
  method: "GET" | "POST" | "PUT" | "PATCH" | "HEAD" | "DELETE"
  retry: boolean
  retryDescription?: string
  maxRetries?: number
  body?: any
}

export interface ApiFetchOptions {
  headers?: GotHeaders
  /**
   * True by default except for api.post (where retry = true must explicitly be passed, since retries aren't always
   * safe / desirable for such requests).
   */
  retry?: boolean
  maxRetries?: number
  /**
   * An optional prefix to use for retry error messages.
   */
  retryDescription?: string
}

export type ApiFetchResponse<T> = T & {
  headers: IncomingHttpHeaders
}

function stripLeadingSlash(str: string) {
  return str.replace(/^\/+/, "")
}

// This is to prevent Unhandled Promise Rejections in got
// See: https://github.com/sindresorhus/got/issues/1489#issuecomment-805485731
function isGotResponseOk(response: GotResponse) {
  const { statusCode } = response
  const limitStatusCode = response.request.options.followRedirect ? 299 : 399

  return (statusCode >= 200 && statusCode <= limitStatusCode) || statusCode === 304
}

export interface Secret {
  name: string
  value: string
}

/**
 * The Garden Cloud / Enterprise API client.
 *
 * Can only be initialized if the user is actually logged in.
 */
export class GardenCloudHttpClient {
  private readonly apiPrefix = "api"
  private readonly globalConfigStore: GlobalConfigStore
  private readonly log: Log

  public readonly domain: string
  public readonly projectId: string | undefined
  public readonly distroName: string

  constructor({
    log,
    domain,
    projectId,
    globalConfigStore,
  }: {
    log: Log
    domain: string
    projectId: string | undefined
    globalConfigStore: GlobalConfigStore
  }) {
    this.log = log
    this.domain = domain
    this.distroName = getCloudDistributionName({ domain, projectId })
    this.globalConfigStore = globalConfigStore
  }

  async apiFetch<T>(path: string, params: ApiFetchParams): Promise<ApiFetchResponse<T>> {
    const { method, headers, retry, retryDescription } = params
    this.log.silly(() => `Calling Cloud API with ${method} ${path}`)
    const token = await getAuthToken(this.log, this.globalConfigStore, this.domain)
    // TODO add more logging details
    const requestObj = {
      method,
      headers: {
        "x-garden-client-version": gardenClientVersion,
        "x-garden-client-name": gardenClientName,
        ...headers,
        ...makeAuthHeader(token || ""),
      },
      json: params.body,
    }

    const requestOptions: GotJsonOptions = {
      ...requestObj,
      responseType: "json",
    }

    const url = new URL(`/${this.apiPrefix}/${stripLeadingSlash(path)}`, this.domain)

    if (retry) {
      let retryLog: Log | undefined = undefined
      const retryLimit = params.maxRetries || 3
      requestOptions.retry = {
        methods: ["GET", "POST", "PUT", "DELETE"], // We explicitly include the POST method if `retry = true`.
        statusCodes: [
          408, // Request Timeout
          // 413, // Payload Too Large: No use in retrying.
          429, // Too Many Requests
          // 500, // Internal Server Error: Generally not safe to retry without potentially creating duplicate data.
          502, // Bad Gateway
          503, // Service Unavailable
          504, // Gateway Timeout

          // Cloudflare-specific status codes
          521, // Web Server Is Down
          522, // Connection Timed Out
          524, // A Timeout Occurred
        ],
        limit: retryLimit,
      }
      requestOptions.hooks = {
        beforeRetry: [
          (error, retryCount) => {
            if (error) {
              // Intentionally skipping search params in case they contain tokens or sensitive data.
              const href = url.origin + url.pathname
              const description = retryDescription || `Request`
              retryLog = retryLog || this.log.createLog({ fixLevel: LogLevel.debug })
              const statusCodeDescription = error.code ? ` (status code ${error.code})` : ``
              retryLog.info(deline`
                ${description} failed with error ${error.message}${statusCodeDescription},
                retrying (${retryCount}/${retryLimit}) (url=${href})
              `)
            }
          },
        ],
        // See: https://github.com/sindresorhus/got/issues/1489#issuecomment-805485731
        afterResponse: [
          (response) => {
            if (isGotResponseOk(response)) {
              response.request.destroy()
            }

            return response
          },
        ],
      }
    } else {
      requestOptions.retry = undefined // Disables retry
    }

    try {
      const res = await got<T>(url.href, requestOptions)

      if (!isObject(res.body)) {
        throw new CloudApiError({
          message: dedent`
          Unexpected response from Garden Cloud: Expected object.

          Request ID: ${res.headers["x-request-id"]}
          Request url: ${url}
          Response code: ${res?.statusCode}
          Response body: ${JSON.stringify(res?.body)}
        `,
          responseStatusCode: res?.statusCode,
        })
      }

      return {
        ...res.body,
        headers: res.headers,
      }
    } catch (e: unknown) {
      if (!(e instanceof RequestError)) {
        throw e
      }

      // The assumption here is that Garden Enterprise is self-hosted.
      // This error should only be thrown if the Garden Enterprise instance is not hosted by us (i.e. Garden Inc.)
      if (
        e.code === "DEPTH_ZERO_SELF_SIGNED_CERT" &&
        getCloudDistributionName({ domain: this.domain, projectId: this.projectId }) === "Garden Enterprise"
      ) {
        throw new CloudApiError({
          message: dedent`
          SSL error when communicating to Garden Cloud: ${e}

          If your Garden Cloud instance is self-hosted and you are using a self-signed certificate, Garden will not trust your system's CA certificates.

          In case if you need to trust extra certificate authorities, consider exporting the environment variable NODE_EXTRA_CA_CERTS. See https://nodejs.org/api/cli.html#node_extra_ca_certsfile

          Request url: ${url}
          Error code: ${e.code}
        `,
        })
      }

      throw e
    }
  }
}
