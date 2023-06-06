/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as opentelemetry from "@opentelemetry/sdk-node"
import { tracer } from "./tracing"
import { getSessionContext } from "./context"
import { prefixWithGardenNamespace } from "./util"

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
