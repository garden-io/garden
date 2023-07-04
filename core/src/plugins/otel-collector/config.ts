import { mergeWith } from "lodash"
import { MergeDeep } from "type-fest"
import { OtlpHttpExporterConfigPartial, OtelCollectorOtlpHttpConfiguration, makeOtlpHttpPartialConfig } from "./config/otlphttp"
import { DatadogExporterConfigPartial, OtelCollectorDatadogConfiguration, makeDatadogPartialConfig } from "./config/datadog"
import { OtelCollectorNewRelicConfiguration, makeNewRelicPartialConfig } from "./config/newrelic"

export type OtelConfigFile = MergeDeep<
  {
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
    exporters: {}
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
          exporters: string[]
        }
      }
      telemetry: {
        logs: {
          level: string
        }
      }
    }
  },
  MergeDeep<OtlpHttpExporterConfigPartial, DatadogExporterConfigPartial, { arrayMergeMode: "spread" }>,
  { arrayMergeMode: "spread" }
>

export type OtelExportersConfig = (
    | OtelCollectorDatadogConfiguration
    | OtelCollectorNewRelicConfiguration
    | OtelCollectorOtlpHttpConfiguration
)

export type OtelCollectorConfigFileOptions = {
  otlpReceiverPort: number
  exporters: OtelExportersConfig[]
}

function mergeArrays(objValue, srcValue) {
  if (Array.isArray(objValue)) {
    return objValue.concat(srcValue)
  }
  return undefined
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
        config = mergeWith(config, makeDatadogPartialConfig(exporter), mergeArrays)
      }
      if (exporter.name === "newrelic") {
        config = mergeWith(config, makeNewRelicPartialConfig(exporter), mergeArrays)
      }
      if (exporter.name === "otlphttp") {
        config = mergeWith(config, makeOtlpHttpPartialConfig(exporter), mergeArrays)
      }
    }
  }

  return config
}
