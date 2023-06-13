import * as opentelemetry from "@opentelemetry/sdk-node"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { gardenEnv } from "../constants"

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
