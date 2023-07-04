import { OtlpHttpExporterConfigPartial, makeOtlpHttpPartialConfig } from "./otlphttp"

export type OtelCollectorNewRelicConfiguration = {
  name: "newrelic"
  enabled: boolean
  endpoint: string
  apiKey: string
}

export function makeNewRelicPartialConfig(config: OtelCollectorNewRelicConfiguration): OtlpHttpExporterConfigPartial {
  return makeOtlpHttpPartialConfig({
    // TODO: Probably should separate the config shape from the exporter shape
    name: "otlphttp",
    enabled: config.enabled,
    endpoint: config.endpoint,
    headers: {
      "api-key": config.apiKey,
    },
  })
}
