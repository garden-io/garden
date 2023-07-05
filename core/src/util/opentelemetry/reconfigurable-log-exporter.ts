import { ExportResult } from "@opentelemetry/core"
import { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs"

type PendingLog = {
  logs: ReadableLogRecord[]
  resultCallback: (result: ExportResult) => void
}

type Deferred<T> = {
  resolve: (value: T) => void
  reject: (reason?: any) => void
  promise: Promise<T>
}

function makeDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void
  let reject: (reason?: any) => void

  const promise = new Promise((pResolve, pReject) => {
    resolve = pResolve
    reject = pReject
  }) as Promise<T>

  return {
    resolve: resolve!,
    reject: reject!,
    promise,
  }
}

export class ReconfigurableLogExporter implements LogRecordExporter {
  private pendingLogs: PendingLog[] = []
  private targetExporter?: LogRecordExporter = undefined

  private shutdownRequested: boolean = false
  private shutdownDeferred?: Deferred<void>

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
    this.shutdownDeferred = makeDeferred()

    return this.shutdownDeferred.promise
  }

  public setTargetExporter(exporter: LogRecordExporter): void {
    if (this.targetExporter) {
      throw new Error("Target Exporter has already been set")
    }

    this.targetExporter = exporter

    for (const { logs, resultCallback } of this.pendingLogs) {
      this.targetExporter.export(logs, resultCallback)
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

  export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
    if (this.targetExporter) {
      this.targetExporter.export(logs, resultCallback)
    } else {
      this.pendingLogs.push({
        logs,
        resultCallback,
      })
    }
  }
}
