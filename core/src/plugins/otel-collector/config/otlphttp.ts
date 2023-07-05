export type OtlpHttpExporterName = `otlphttp/${string | number}`

export type OtlpHttpExporterConfigPartial = {
  exporters: {
    [key: OtlpHttpExporterName]:
      | {
          endpoint: string
          headers?: Record<string, string | number | undefined>
        }
      | undefined
  }
  service: {
    pipelines: {
      traces?: {
        exporters: OtlpHttpExporterName[]
      }
      logs?: {
        exporters: OtlpHttpExporterName[]
      }
    }
  }
}

export type OtelCollectorOtlpHttpConfiguration = {
  name: "otlphttp"
  enabled: boolean
  endpoint: string
  types: ("logs" | "traces")[]
  headers?: Record<string, string | number | undefined>
}

export const makeOtlpHttpPartialConfig = (() => {
  // We use the counter to make sure every http based config has a unique key
  let counter = 0
  return function (config: OtelCollectorOtlpHttpConfiguration): OtlpHttpExporterConfigPartial {
    counter = counter + 1
    const key: OtlpHttpExporterName = `otlphttp/${counter}`

    return {
      exporters: {
        [key]: {
          endpoint: config.endpoint,
          headers: config.headers,
        },
      },
      service: {
        pipelines: {
          traces: config.types.includes("traces")
            ? {
                exporters: [key],
              }
            : undefined,
          logs: config.types.includes("logs")
            ? {
                exporters: [key],
              }
            : undefined,
        },
      },
    }
  }
})()
