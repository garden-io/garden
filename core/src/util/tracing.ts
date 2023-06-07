import * as opentelemetry from "@opentelemetry/sdk-node"

export const tracer = opentelemetry.api.trace.getTracer("garden")
export const getActiveContext = () => opentelemetry.api.context.active()

type GetContextCallback<T extends any[], C> = (this: C, ...args: T) => opentelemetry.api.Attributes
type GetNameCallback<T extends any[], C> = (this: C, ...args: T) => string

export function OtelTraced<T extends any[], C>({
  getContext,
  name,
}: {
  name: string | GetNameCallback<T, C>
  getContext?: GetContextCallback<T, C>
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
        if (getContext) {
          span.setAttributes(getContext.apply(this, args))
        }
        const result = await method.apply(this, args)
        span.end()
        return result
      })
    }
  }
}
