/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ExportResult } from "@opentelemetry/core"
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base"

/**
 * This exporter does nothing.
 * It exists so that we can set it for the ReconfigurableExporter
 * in case no otel provider is set in the project
 * so that we're not leaking memory.
 */
export class NoOpExporter implements SpanExporter {
  public export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    resultCallback({ code: 0 })
  }

  public async shutdown(): Promise<void> {
    return
  }

  public async forceFlush(): Promise<void> {
    return
  }
}
