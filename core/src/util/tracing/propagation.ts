import * as opentelemetry from "@opentelemetry/sdk-node"
import env from "env-var"
import { getActiveContext } from "./context"

const VERSION = "00"
const VERSION_PART = "(?!ff)[\\da-f]{2}"
const TRACE_ID_PART = "(?![0]{32})[\\da-f]{32}"
const PARENT_ID_PART = "(?![0]{16})[\\da-f]{16}"
const FLAGS_PART = "[\\da-f]{2}"
const TRACE_PARENT_REGEX = new RegExp(
  `^\\s?(${VERSION_PART})-(${TRACE_ID_PART})-(${PARENT_ID_PART})-(${FLAGS_PART})(-.*)?\\s?$`
)

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

export function parsePropagationEnvVars() {
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
