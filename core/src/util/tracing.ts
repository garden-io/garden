import * as opentelemetry from "@opentelemetry/sdk-node"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { gardenEnv } from "../constants"
import env from "env-var"


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

const SESSION_ID_CONTEXT_KEY = opentelemetry.api.createContextKey("sessionIdContext")
const PARENT_SESSION_ID_CONTEXT_KEY = opentelemetry.api.createContextKey("parentSessionIdContext")

export const tracer = opentelemetry.api.trace.getTracer("garden")
export const getActiveContext = () => opentelemetry.api.context.active()

export type SessionContext = {
  sessionId?: string
  parentSessionId?: string
}

export type SessionContextOptions = {
  sessionId: string
  parentSessionId?: string | null
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

export function getSessionContext(): SessionContext {
  const context = getActiveContext()
  const sessionId = context.getValue(SESSION_ID_CONTEXT_KEY) as string | undefined
  const parentSessionId = context.getValue(PARENT_SESSION_ID_CONTEXT_KEY) as string | undefined

  return { sessionId, parentSessionId }
}

export function prefixWithGardenNamespace(data: opentelemetry.api.Attributes): opentelemetry.api.Attributes {
  const unprefixed = Object.entries(data)

  return Object.fromEntries(
    unprefixed.map(([key, value]) => {
      return [`garden.${key}`, value]
    })
  )
}

type GetAttributesCallback<T extends any[], C> = (this: C, ...args: T) => opentelemetry.api.Attributes
type GetNameCallback<T extends any[], C> = (this: C, ...args: T) => string

export function OtelTraced<T extends any[], C>({
  getAttributes,
  name,
}: {
  name: string | GetNameCallback<T, C>
  getAttributes?: GetAttributesCallback<T, C>
}) {
  return function tracedWrapper(
    target: C,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<any>>
  ) {
    const method = descriptor.value

    if (!method) {
      throw new Error("No method to decorate")
    }

    descriptor.value = async function (this: C, ...args: T) {
      const resolvedName = typeof name === "string" ? name : name.apply(this, args)
      return tracer.startActiveSpan(resolvedName, async (span) => {
        const sessionContext = getSessionContext()

        if (getAttributes) {
          span.setAttributes(
            prefixWithGardenNamespace({
              ...sessionContext,
              ...getAttributes.apply(this, args),
            })
          )
        }

        let result
        try {
          result = await method.apply(this, args)
        } catch (err) {
          span.recordException(err)
          throw err
        } finally {
          span.end()
        }

        return result
      })
    }
  }
}

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

export function wrapActiveSpan<T>(name: string, fn: (span: opentelemetry.api.Span) => Promise<T>): Promise<T> {
  return startActiveSpan(name, async (span) => {
    try {
      return await fn(span)
    } finally {
      span.end()
    }
  })
}

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

export function bindActiveContext<T>(target: T): T {
  return opentelemetry.api.context.bind(getActiveContext(), target)
}

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

// Singleton we initialize either when we get the SDK the first time
// or when we call `initTracing` explicitly
// We do this to ensure that the SDK can be initialized as the first thing in the application
// so that it can integrate its instrumentation before any other imports happened
let otelSDK: opentelemetry.NodeSDK | undefined

export const getOtelSDK: () => opentelemetry.NodeSDK = () => {
  if (!otelSDK) {
    return initTracing()
  } else {
    return otelSDK
  }
}

export function initTracing(): opentelemetry.NodeSDK {
  if (otelSDK) {
    return otelSDK
  }

  if (!gardenEnv.GARDEN_ENABLE_TRACING) {
    process.env.OTEL_SDK_DISABLED = "true"
  }

  otelSDK = new opentelemetry.NodeSDK({
    serviceName: "garden-cli",
    instrumentations: [
      new HttpInstrumentation({
        applyCustomAttributesOnSpan: () => {
          return prefixWithGardenNamespace(getSessionContext())
        },
        ignoreOutgoingRequestHook: (request) => {
          return Boolean(
            request.hostname?.includes("segment.io") ||
              (request.hostname?.includes("garden.io") &&
                (request.path?.includes("/events") || request.path?.includes("/version")))
          )
        },
      }),
    ],
    autoDetectResources: false,
  })

  otelSDK.start()

  return otelSDK
}
