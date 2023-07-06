export type LoggingExporterVerbosityLevel = "detailed" | "normal" | "basic"
export const LoggingExporterVerbosityLevelEnum = [
  "detailed",
  "normal",
  "basic",
] as const satisfies readonly LoggingExporterVerbosityLevel[]

export type LoggingExporterConfigPartial = {
  exporters: {
    logging?: {
      verbosity: LoggingExporterVerbosityLevel
    }
  }
  service: {
    pipelines: {
      traces: {
        exporters: ["logging"]
      }
    }
  }
}

export type OtelCollectorLoggingConfiguration = {
  name: "logging"
  enabled: boolean
  verbosity: LoggingExporterVerbosityLevel
}

export function makeLoggingPartialConfig(config: OtelCollectorLoggingConfiguration): LoggingExporterConfigPartial {
  return {
    exporters: {
      logging: {
        verbosity: config.verbosity,
      },
    },
    service: {
      pipelines: {
        traces: {
          exporters: ["logging"],
        },
      },
    },
  }
}
