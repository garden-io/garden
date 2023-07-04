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

export type OtelConfigFile = MergeDeep<
  OtelCollectorBaseConfig,
  MergeDeep<OtlpHttpExporterConfigPartial, DatadogExporterConfigPartial, { arrayMergeMode: "spread" }>,
  { arrayMergeMode: "spread" }
>

export type OtelExportersConfig =
  | OtelCollectorDatadogConfiguration
  | OtelCollectorNewRelicConfiguration
  | OtelCollectorOtlpHttpConfiguration

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
  let config: OtelConfigFile = getOtelCollectorBaseConfig(otlpReceiverPort)

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
