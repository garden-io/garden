/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as opentelemetry from "@opentelemetry/sdk-node"
import env from "env-var"
import { getActiveContext } from "./context.js"

const VERSION = "00"
const VERSION_PART = "(?!ff)[\\da-f]{2}"
const TRACE_ID_PART = "(?![0]{32})[\\da-f]{32}"
const PARENT_ID_PART = "(?![0]{16})[\\da-f]{16}"
const FLAGS_PART = "[\\da-f]{2}"
const TRACE_PARENT_REGEX = new RegExp(
  `^\\s?(${VERSION_PART})-(${TRACE_ID_PART})-(${PARENT_ID_PART})-(${FLAGS_PART})(-.*)?\\s?$`
)

/**
 * Parses a traceparent value into the correct span context
 * Taken from https://github.com/open-telemetry/opentelemetry-js/blob/10c3e934cc743211af9811037e6fa63bea2744ee/packages/opentelemetry-core/src/trace/W3CTraceContextPropagator.ts#L52
 * @param traceParent
 * @returns
 */
function parseTraceParent(traceParent: string): opentelemetry.api.SpanContext | null {
  const match = TRACE_PARENT_REGEX.exec(traceParent)
  if (!match) {
    return null
  }

  // According to the specification the implementation should be compatible
  // with future versions. If there are more parts, we only reject it if it's using version 00
  // See https://www.w3.org/TR/trace-context/#versioning-of-traceparent
  if (match[1] === "00" && match[5]) {
    return null
  }

  return {
    traceId: match[2],
    spanId: match[3],
    traceFlags: parseInt(match[4], 16),
  }
}

const TRACE_PARENT_ENV_VAR = "OTEL_TRACE_PARENT"
const TRACE_STATE_ENV_VAR = "OTEL_TRACE_STATE"

/**
 * Gets the environment variables for the TraceParent and TraceState of the currently active context
 * Used to propagate the trace context to other processes using environment variables.
 * @returns Object containing `OTEL_TRACE_PARENT` and `OTEL_TRACE_STATE` strings
 */
export function getTracePropagationEnvVars() {
  const spanContext = opentelemetry.api.trace.getSpanContext(getActiveContext())

  if (!spanContext) {
    return {}
  }

  const traceParent = `${VERSION}-${spanContext.traceId}-${spanContext.spanId}-0${Number(
    spanContext.traceFlags || opentelemetry.api.TraceFlags.NONE
  ).toString(16)}`

  return {
    [TRACE_PARENT_ENV_VAR]: traceParent,
    [TRACE_STATE_ENV_VAR]: spanContext.traceState ? spanContext.traceState.serialize() : undefined,
  }
}

/**
 * Parses the `OTEL_TRACE_PARENT` and `OTEL_TRACE_STATE` environment variables
 * into a SpanContext object that can be set as the active context to continue tracing
 * across garden processes.
 * @returns The SpanContext object derived from the environment variables or `undefined`
 */
export function parsePropagationEnvVars(): opentelemetry.api.SpanContext | undefined {
  const traceParentEnvVar = env.get(TRACE_PARENT_ENV_VAR).required(false).asString()
  const traceStateEnvVar = env.get(TRACE_STATE_ENV_VAR).required(false).asString()

  if (!traceParentEnvVar) {
    return undefined
  }

  const traceParent = parseTraceParent(traceParentEnvVar)!

  if (traceStateEnvVar) {
    const traceState = opentelemetry.api.createTraceState(traceStateEnvVar ?? undefined)
    traceParent.traceState = traceState
  }

  return traceParent
}

/**
 * Executes the wrapped callback function using the `SpanContext` extracted via `parsePropagationEnvVars` as the active context.
 * Best called before any spans are created so that all new spans contain the correct tracing context
 * that continues as child spans from the parent process.
 * @param fn The callback function which executes with the propagated parent context
 * @returns A promise resolving with the callback's return value
 */
export function withContextFromEnv<T>(fn: () => Promise<T>): Promise<T> {
  const traceParent = parsePropagationEnvVars()

  if (traceParent) {
    const context = opentelemetry.api.trace.setSpanContext(getActiveContext(), traceParent)
    return opentelemetry.api.context.with(context, () => {
      return fn()
    })
  } else {
    return fn()
  }
}
