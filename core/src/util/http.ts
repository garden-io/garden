/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Headers, Response, OptionsOfJSONResponseBody, OptionsOfTextResponseBody } from "got"
import _got, { HTTPError as GotHttpError } from "got"
import { bootstrap } from "global-agent"

// Handle proxy environment settings
// (see https://github.com/gajus/global-agent#what-is-the-reason-global-agentbootstrap-does-not-use-http_proxy)
const isProxyEnvSet = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.NO_PROXY

if (isProxyEnvSet) {
  bootstrap({
    environmentVariableNamespace: "",
    // We can't force the global agent because the Kubernetes client library relies on the agent to configure trusted CA certificates.
    // In the Kubernetes client, we added code to make sure we respect the PROXY environment variables (using the proxy-agent lirbary).
    forceGlobalAgent: false,
  })
}

// Exporting from here to make sure the global-agent bootstrap is executed, and for convenience as well
export const got = _got
export type GotTextOptions = OptionsOfTextResponseBody
export type GotJsonOptions = OptionsOfJSONResponseBody
export type GotResponse<T = unknown> = Response<T>
export type GotHeaders = Headers
export { GotHttpError }
