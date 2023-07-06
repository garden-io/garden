import { mergeWith } from "lodash"
import { MergeDeep } from "type-fest"
import {
  OtlpHttpExporterConfigPartial,
  OtelCollectorOtlpHttpConfiguration,
  makeOtlpHttpPartialConfig,
} from "./config/otlphttp"
import {
  DatadogExporterConfigPartial,
  OtelCollectorDatadogConfiguration,
  makeDatadogPartialConfig,
} from "./config/datadog"
import { OtelCollectorNewRelicConfiguration, makeNewRelicPartialConfig } from "./config/newrelic"
import { OtelCollectorBaseConfig, getOtelCollectorBaseConfig } from "./config/base"
import { OtelCollectorHoneycombConfiguration, makeHoneycombPartialConfig } from "./config/honeycomb"

export type OtelConfigFile = MergeDeep<
  OtelCollectorBaseConfig,
  MergeDeep<OtlpHttpExporterConfigPartial, DatadogExporterConfigPartial, { arrayMergeMode: "spread" }>,
  { arrayMergeMode: "spread" }
>

export type OtelExportersConfig =
  | OtelCollectorDatadogConfiguration
  | OtelCollectorNewRelicConfiguration
  | OtelCollectorOtlpHttpConfiguration
  | OtelCollectorHoneycombConfiguration

export type OtelCollectorConfigFileOptions = {
  exporters: OtelExportersConfig[]
}

function mergeArrays(objValue, srcValue) {
  if (Array.isArray(objValue)) {
    return objValue.concat(srcValue)
  }
  return undefined
}

export function getOtelCollectorConfigFile({ exporters }: OtelCollectorConfigFileOptions) {
  let config: OtelConfigFile = getOtelCollectorBaseConfig()

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
      if (exporter.name === "honeycomb") {
        config = mergeWith(config, makeHoneycombPartialConfig(exporter), mergeArrays)
      }
    }
  }

  return config
}
