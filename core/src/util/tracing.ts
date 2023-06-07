import * as opentelemetry from "@opentelemetry/sdk-node"

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
  }

  return opentelemetry.api.context.with(newContext, fn)
}

export function getSessionContext(): SessionContext {
  const context = getActiveContext()
  const sessionId = context.getValue(SESSION_ID_CONTEXT_KEY) as string | undefined
  const parentSessionId = context.getValue(PARENT_SESSION_ID_CONTEXT_KEY) as string | undefined

  return { sessionId, parentSessionId }
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
          span.setAttributes({
            ...sessionContext,
            ...getAttributes.apply(this, args)
          })
        }
        let result
        try {
          result = await method.apply(this, args)
        } catch (err) {
          span.recordException(err)
          span.end()
          throw err
        }
        span.end()
        return result
      })
    }
  }
}
