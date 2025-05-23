/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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

/**
 * Gets the current active context
 * @returns The active `Context`
 */
export const getActiveContext = () => opentelemetry.api.context.active()

/**
 * Gets the Core SessionContext from the current active context
 * @returns A `SessionContext` Object
 */
export function getSessionContext(): SessionContext {
  const context = getActiveContext()
  const sessionId = context.getValue(SESSION_ID_CONTEXT_KEY) as string | undefined
  const parentSessionId = context.getValue(PARENT_SESSION_ID_CONTEXT_KEY) as string | undefined

  return { sessionId, parentSessionId }
}

/**
 * Bind the current active context to a target function or event emitter
 * This is needed for example when you want to trace code
 * that is triggered from an `EventEmitter`.
 * Due to how the context is propagated, the callback would otherwise lose its parent context.
 *
 * @param target function or `EventEmitter` to bind
 * @returns The bound function or `EventEmitter`
 */
export function bindActiveContext<T>(target: T): T {
  return opentelemetry.api.context.bind(getActiveContext(), target)
}

/**
 * Sets the `sessionId` and `parentSessionId` from the `SessionContext`
 * on a new Context and executes the wrapped function with that context.
 * Used to automatically annotate any spans below with the `SessionContext` data attributes.
 *
 * @param sessionContextOptions The new Core `SessionContext` to set
 * @param fn The callback function which executes with the new context
 * @returns A promise resolving with the callback's return value
 */
export function withSessionContext<T>(sessionContextOptions: SessionContextOptions, fn: () => Promise<T>): Promise<T> {
  const { sessionId, parentSessionId } = sessionContextOptions
  const activeContext = getActiveContext()

  let newContext = activeContext.setValue(SESSION_ID_CONTEXT_KEY, sessionId)
  if (parentSessionId) {
    newContext = newContext.setValue(PARENT_SESSION_ID_CONTEXT_KEY, parentSessionId)
  } else {
    newContext = newContext.deleteValue(PARENT_SESSION_ID_CONTEXT_KEY)
  }

  return opentelemetry.api.context.with(newContext, fn)
}
