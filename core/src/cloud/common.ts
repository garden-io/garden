/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ParsedUrlQuery } from "node:querystring"
import type EventEmitter2 from "eventemitter2"
import type { Log } from "../logger/log-entry.js"

export type AuthToken = {
  token: string
  refreshToken: string
  tokenValidity: number
  // TODO: Would be neater to do this with a union type, but this feels simpler for now.
  organizationId?: string
}

export type AuthRedirectServerConfig = {
  events: EventEmitter2.EventEmitter2
  log: Log
  getLoginUrl: (port: number) => string
  successUrl: string
  extractAuthToken: (query: ParsedUrlQuery) => AuthToken
}

export type AuthRedirectConfig = Pick<AuthRedirectServerConfig, "getLoginUrl" | "successUrl" | "extractAuthToken">
