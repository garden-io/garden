/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type * as opentelemetry from "@opentelemetry/sdk-node"
import { tracer } from "./tracing.js"
import { getSessionContext } from "./context.js"
import { prefixWithGardenNamespace } from "./util.js"

/**
 * Starts a new Span and calls the given function passing it the created span as first argument.
 * Additionally the new span gets set in context and this context is activated for the duration of the function call.
 * That means that any following span will have this span as a parent span.
 * Will also set the core session context as attributes on the span.
 *
 * The span is not ended automatically and `span.end()` has to be called explicitly.
 *
 * @param name The name of the span
 * @param fn The callback function which executes under the span
 * @returns A promise resolving with the callback's return value
 */
export function startActiveSpan<T>(name: string, fn: (span: opentelemetry.api.Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    const sessionContext = getSessionContext()

    span.setAttributes(
      prefixWithGardenNamespace({
        ...sessionContext,
      })
    )

    return fn(span)
  })
}

/**
 * Like `startActiveSpan` but automatically ends the span when the Promise returned by the callback resolves.
 *
 * @param name The name of the span
 * @param fn The callback function which executes under the span
 * @returns A promise resolving with the callback's return value
 */
export function wrapActiveSpan<T>(name: string, fn: (span: opentelemetry.api.Span) => Promise<T>): Promise<T> {
  return startActiveSpan(name, async (span) => {
    try {
      return await fn(span)
    } finally {
      span.end()
    }
  })
}

/**
 * Starts a new Span.
 * Start the span without setting it on context.
 * That means it will not automatically be a parent span for subsequent spans.
 * Best used to trace linear and synchronous codepaths.
 *
 * Will also set the core session context as attributes on the span.
 *
 * @param name The name of the span
 * @returns The span
 */
export function startSpan(name: string): opentelemetry.api.Span {
  const span = tracer.startSpan(name)

  const sessionContext = getSessionContext()

  span.setAttributes(
    prefixWithGardenNamespace({
      ...sessionContext,
    })
  )

  return span
}
