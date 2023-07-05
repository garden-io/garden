import { hostname } from "os"

export type DatadogExporterConfigPartial = {
  exporters: {
    datadog?: {
      api: {
        site: string
        key: string
        fail_on_invalid_key?: boolean
      }
      hostname?: string
    }
  }
  service: {
    pipelines: {
      traces?: {
        exporters: ["datadog"]
      }
      logs?: {
        exporters: ["datadog"]
      }
    }
  }
}

export type OtelCollectorDatadogConfiguration = {
  name: "datadog"
  enabled: boolean
  site: string
  apiKey: string
  types: ("logs" | "traces")[]
}


export function makeDatadogPartialConfig(config: OtelCollectorDatadogConfiguration): DatadogExporterConfigPartial {
  return {
    exporters: {
      datadog: {
        api: {
          site: config.site,
          key: config.apiKey,
          fail_on_invalid_key: true,
        },
        // Hardcoded here due to performance problems with provider init
        // See https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/16442
        hostname: hostname(),
      },
    },
    service: {
      pipelines: {
        traces: config.types.includes("traces") ? {
          exporters: ["datadog"],
        } : undefined,
        logs: config.types.includes("logs") ? {
          exporters: ["datadog"]
        } : undefined
      },
    },
  }
}
