export type OtelCollectorBaseConfig = {
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
}

export function getOtelCollectorBaseConfig(otlpReceiverPort: string | number): OtelCollectorBaseConfig {
  return {
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
}
