import { Logger } from "@opentelemetry/api-logs"
import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base"
import { ReconfigurableLogExporter } from "./reconfigurable-log-exporter"

let logger: Logger | undefined

export const reconfigurableExporter = new ReconfigurableLogExporter()

export function getLogger() {
  if (!logger) {
    initLogging()
  }
  return logger
}

export function initLogging() {
  const loggerProvider = new LoggerProvider()

  loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(reconfigurableExporter, {
    scheduledDelayMillis: 100
  }))

  logger = loggerProvider.getLogger("default")
}

export function configureOTLPHttpLogsExporter(config?: OTLPExporterNodeConfigBase | undefined): void {
  const exporter = new OTLPLogExporter(config)
  reconfigurableExporter.setTargetExporter(exporter)
}
