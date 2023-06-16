import * as opentelemetry from "@opentelemetry/sdk-node"
import { tracer } from "./tracing"
import { getSessionContext } from "./context"
import { prefixWithGardenNamespace } from "./util"

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
