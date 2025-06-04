/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { type ExportResult } from "@opentelemetry/core"
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base"
import type { Deferred } from "../../util.js"
import { defer } from "../../util.js"

type PendingSpan = {
  spans: ReadableSpan[]
  resultCallback: (result: ExportResult) => void
}

export class ReconfigurableExporter implements SpanExporter {
  private pendingSpans: PendingSpan[] = []
  private targetExporter?: SpanExporter = undefined

  private forceFlushRequested = false
  private forceFlushDeferred?: Deferred<void>
  private shutdownRequested = false
  private shutdownDeferred?: Deferred<void>

  public export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (this.targetExporter) {
      this.targetExporter.export(spans, resultCallback)
    } else {
      this.pendingSpans.push({
        spans,
        resultCallback,
      })
    }
  }

  public async shutdown(): Promise<void> {
    if (this.targetExporter) {
      return this.targetExporter.shutdown()
    }

    // If shutdown was already requested before
    // we ignore the new request and return the old promise
    if (this.shutdownRequested) {
      return this.shutdownDeferred!.promise
    }

    this.shutdownRequested = true
    this.shutdownDeferred = defer()

    return this.shutdownDeferred.promise
  }

  public async forceFlush(): Promise<void> {
    if (this.targetExporter) {
      if (this.targetExporter.forceFlush) {
        return this.targetExporter.forceFlush()
      } else {
        return
      }
    }

    // If flush was already requested before
    // we ignore the new request and return the old promise
    if (this.forceFlushRequested) {
      return this.forceFlushDeferred!.promise
    }

    this.forceFlushRequested = true
    this.forceFlushDeferred = defer()

    return this.forceFlushDeferred.promise
  }

  public setTargetExporter(exporter: SpanExporter): void {
    this.targetExporter = exporter

    for (const { spans, resultCallback } of this.pendingSpans) {
      this.targetExporter.export(spans, resultCallback)
    }

    if (this.forceFlushRequested && this.targetExporter.forceFlush) {
      this.targetExporter
        .forceFlush()
        .then(() => {
          this.forceFlushDeferred?.resolve()
        })
        .catch((err) => {
          this.forceFlushDeferred?.reject(err)
        })
        .finally(() => {
          this.forceFlushRequested = false
          this.forceFlushDeferred = undefined
        })
    }

    if (this.shutdownRequested) {
      this.targetExporter
        .shutdown()
        .then(() => {
          this.shutdownDeferred?.resolve()
        })
        .catch((err) => {
          this.shutdownDeferred?.reject(err)
        })
    }
  }

  public hasTargetExporter() {
    return !!this.targetExporter
  }
}
