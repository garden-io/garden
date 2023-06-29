export const OTEL_CONFIG_FILE = {
  receivers: {
    otlp: {
      protocols: {
        http: {
          // TODO: Currently set to 4319 to have Jaeger and the collector co-exist on the same machine
          // This should be changed back to the default
          endpoint: ":4319",
        },
      },
    },
  },
  processors: {
    batch: null,
  },
  exporters: {
    otlphttp: {
      endpoint: "http://0.0.0.0:4318",
    },
  },
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
        exporters: ["otlphttp"],
      },
      metrics: {
        receivers: ["otlp"],
        processors: ["batch"],
        exporters: ["otlphttp"],
      },
      logs: {
        receivers: ["otlp"],
        processors: ["batch"],
        exporters: ["otlphttp"],
      },
    },
    telemetry: {
      logs: {
        level: "debug",
      },
    },
  },
}

