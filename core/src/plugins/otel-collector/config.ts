export type OtelConfigFile = {
  receivers: {
    otlp: {
      protocols: {
        http: {
          endpoint: string
        }
      }
    }
  }
  processors: {
    batch: null
  }
  exporters: {
    otlphttp?: {
      endpoint: string
      headers?: Record<string, string | number>
    }
    datadog?: {
      api: {
        site: string
        key: string
      }
      hostname?: string
    }
  }
  extensions: {
    health_check: null
    pprof: null
    zpages: null
  }
  service: {
    extensions: ["health_check", "pprof", "zpages"]
    pipelines: {
      traces: {
        receivers: ["otlp"]
        processors: ["batch"]
        exporters: ("otlphttp" | "datadog")[]
      }
      metrics: {
        receivers: ["otlp"]
        processors: ["batch"]
        exporters: ("otlphttp" | "datadog")[]
      }
      logs: {
        receivers: ["otlp"]
        processors: ["batch"]
        exporters: ("otlphttp" | "datadog")[]
      }
    }
    telemetry: {
      logs: {
        level: string
      }
    }
  }
}

export type OtelExporter = {
  enabled: boolean
  name: "datadog" | "newrelic" | "otlphttp"
}

export type OtelCollectorDatadogConfiguration = OtelExporter & {
  name: "datadog"
  site: string
  apiKey: string
}

export type OtelCollectorNewRelicConfiguration = OtelExporter & {
  name: "newrelic"
  endpoint: string
  apiKey: string
}

export type OtelCollectorOtlpHttpConfiguration = OtelExporter & {
  name: "otlphttp"
  endpoint: string
  headers?: Record<string, string | number>
}

export type OtelCollectorConfigFileOptions = {
  otlpReceiverPort: number
  exporters: (
    | OtelCollectorDatadogConfiguration
    | OtelCollectorNewRelicConfiguration
    | OtelCollectorOtlpHttpConfiguration
  )[]
}
export function getOtelCollectorConfigFile({ otlpReceiverPort, exporters }: OtelCollectorConfigFileOptions) {
  const baseConfig: OtelConfigFile = {
    receivers: {
      otlp: {
        protocols: {
          http: {
            endpoint: `:${otlpReceiverPort}`,
          },
        },
      },
    },
    processors: {
      batch: null,
    },
    exporters: {},
    extensions: {
      health_check: null,
      pprof: null,
      zpages: null,
    },
    service: {
      extensions: ["health_check", "pprof", "zpages"],
      pipelines: {
        traces: {
          receivers: ["otlp"],
          processors: ["batch"],
          exporters: [],
        },
        logs: {
          receivers: ["otlp"],
          processors: ["batch"],
          exporters: [],
        },
        metrics: {
          receivers: ["otlp"],
          processors: ["batch"],
          exporters: [],
        },
      },
      telemetry: {
        logs: {
          level: "debug",
        },
      },
    },
  }

  for (const exporter of exporters) {
    if (exporter.enabled) {
      if (exporter.name === "datadog") {
        baseConfig.exporters.datadog = {
          api: {
            site: exporter.site,
            key: exporter.apiKey,
          },
          // Hardcoded here due to performance problems with provider init
          // See https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/16442
          hostname: "garden.local",
        }
        baseConfig.service.pipelines.traces.exporters.push("datadog")
        baseConfig.service.pipelines.metrics.exporters.push("datadog")
        baseConfig.service.pipelines.logs.exporters.push("datadog")
      }
      if (exporter.name === "newrelic") {
        baseConfig.exporters.otlphttp = {
          endpoint: exporter.endpoint,
          headers: {
            "api-key": exporter.apiKey,
          },
        }
        baseConfig.service.pipelines.traces.exporters.push("otlphttp")
      }
      if (exporter.name === "otlphttp") {
        baseConfig.exporters.otlphttp = {
          endpoint: exporter.endpoint,
          headers: exporter.headers,
        }
        baseConfig.service.pipelines.traces.exporters.push("otlphttp")
      }
    }
  }

  return baseConfig
}
