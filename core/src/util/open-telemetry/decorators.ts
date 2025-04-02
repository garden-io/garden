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
import { InternalError } from "../../exceptions.js"

type GetAttributesCallback<T extends any[], C> = (this: C, ...args: T) => opentelemetry.api.Attributes
type GetNameCallback<T extends any[], C> = (this: C, ...args: T) => string

/**
 * Class Method Decorator that automatically traces the method.
 * Ensures to set the `SessionContext` and any additional attributes on the span.
 * Automatically terminates the span and records an exception if the method throws.
 *
 * The name of the span can be static or derived from the `this` context and the call arguments to the function.
 * The attributes of the span can be derived from the `this` context and the call arguments to the function.
 *
 * Note: Until https://github.com/microsoft/TypeScript/issues/54587 is resolved, the `getAttributes` callback
 * always needs to define the method arguments even if unused.
 *
 * @param param0 `name` String or callback and `getAttributes` callback for the trace
 * @returns The decorator function
 */
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
      throw new InternalError({ message: "No method to decorate" })
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
        } catch (err: any) {
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
