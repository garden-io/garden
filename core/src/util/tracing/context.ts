/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as opentelemetry from "@opentelemetry/sdk-node"

const SESSION_ID_CONTEXT_KEY = opentelemetry.api.createContextKey("sessionIdContext")
const PARENT_SESSION_ID_CONTEXT_KEY = opentelemetry.api.createContextKey("parentSessionIdContext")

export type SessionContext = {
  sessionId?: string
  parentSessionId?: string
}

export type SessionContextOptions = {
  sessionId: string
  parentSessionId?: string | null
}

export const getActiveContext = () => opentelemetry.api.context.active()

export function getSessionContext(): SessionContext {
  const context = getActiveContext()
  const sessionId = context.getValue(SESSION_ID_CONTEXT_KEY) as string | undefined
  const parentSessionId = context.getValue(PARENT_SESSION_ID_CONTEXT_KEY) as string | undefined

  return { sessionId, parentSessionId }
}

export function bindActiveContext<T>(target: T): T {
  return opentelemetry.api.context.bind(getActiveContext(), target)
}

export function withSessionContext<T>(
  { sessionId, parentSessionId }: SessionContextOptions,
  fn: () => Promise<T>
): Promise<T> {
  const activeContext = getActiveContext()

  let newContext = activeContext.setValue(SESSION_ID_CONTEXT_KEY, sessionId)
  if (parentSessionId) {
    newContext = newContext.setValue(PARENT_SESSION_ID_CONTEXT_KEY, parentSessionId)
  } else {
    newContext = newContext.deleteValue(PARENT_SESSION_ID_CONTEXT_KEY)
  }

  return opentelemetry.api.context.with(newContext, fn)
}
