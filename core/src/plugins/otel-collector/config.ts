/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

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
import { OtelCollectorLoggingConfiguration, makeLoggingPartialConfig } from "./config/logging"

export type OtelConfigFile = MergeDeep<
  OtelCollectorBaseConfig,
  MergeDeep<OtlpHttpExporterConfigPartial, DatadogExporterConfigPartial, { arrayMergeMode: "spread" }>,
  { arrayMergeMode: "spread" }
>

export type OtelExportersConfig =
  | OtelCollectorLoggingConfiguration
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
      if (exporter.name === "logging") {
        config = mergeWith(config, makeLoggingPartialConfig(exporter), mergeArrays)
      }
    }
  }

  return config
}
