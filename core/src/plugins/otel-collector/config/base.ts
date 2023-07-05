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
  extensions: Record<string, null>
  service: {
    extensions: string[]
    pipelines: {
      traces?: {
        receivers: ["otlp"]
        processors: string[]
        exporters: string[]
      }
      logs?: {
        receivers: ["otlp"]
        processors: string[]
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

export function getOtelCollectorBaseConfig({
  otlpReceiverPort,
  hasLogs,
  hasTraces,
}: {
  otlpReceiverPort: string | number
  hasLogs: boolean
  hasTraces: boolean
}): OtelCollectorBaseConfig {
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
    exporters: {},
    processors: {
      batch: null,
    },
    extensions: {},
    service: {
      extensions: [],
      pipelines: {
        traces: hasTraces ? {
          receivers: ["otlp"],
          processors: ["batch"],
          exporters: [],
        } : undefined,
        logs: hasLogs ? {
          receivers: ["otlp"],
          processors: ["batch"],
          exporters: [],
        } : undefined,
      },
      telemetry: {
        logs: {
          level: "debug",
        },
      },
    },
  }
}
