import { merge } from "lodash"
import { hostname } from "os"

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
    batch: null | {
      send_batch_max_size?: number
      timeout?: string
    }
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
        fail_on_invalid_key?: boolean
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

function makeDatadogPartialConfig(config: OtelCollectorDatadogConfiguration) {
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
        traces: {
          exporters: ["datadog"]
        }
      }
    }
  }
}

function makeOtlpHttpPartialConfig(config: OtelCollectorOtlpHttpConfiguration) {
  return {
    exporters: {
      otlphttp: {
        endpoint: config.endpoint,
        headers: config.headers,
      },
    },
    service: {
      pipelines: {
        traces: {
          exporters: ["otlphttp"],
        },
      },
    },
  }
}

function makeNewRelicPartialConfig(config: OtelCollectorNewRelicConfiguration) {
  // TODO: Cleanup config types
  return makeOtlpHttpPartialConfig({
    name: "otlphttp",
    enabled: config.enabled,
    endpoint: config.endpoint,
    headers: {
      "api-key": config.apiKey,
    },
  })
}

export function getOtelCollectorConfigFile({ otlpReceiverPort, exporters }: OtelCollectorConfigFileOptions) {
  let config: OtelConfigFile = {
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
        config = merge(config, makeDatadogPartialConfig(exporter))
      }
      if (exporter.name === "newrelic") {
        config = merge(config, makeNewRelicPartialConfig(exporter))
      }
      if (exporter.name === "otlphttp") {
        config = merge(config, makeOtlpHttpPartialConfig(exporter))
      }
    }
  }

  return config
}
