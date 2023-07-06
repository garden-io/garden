export type OtelCollectorBaseConfig = {
  processors: {
    batch: null | {
      send_batch_max_size?: number
      timeout?: string
    }
  }
  exporters: {}
  extensions: Record<string, null>
  service: {
    extensions: string[]
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

export function getOtelCollectorBaseConfig(): OtelCollectorBaseConfig {
  return {
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
      extensions: [],
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
