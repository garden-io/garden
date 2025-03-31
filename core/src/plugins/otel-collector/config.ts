/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mergeWith } from "lodash-es"
import type { MergeDeep } from "type-fest"
import type { OtlpHttpExporterConfigPartial, OtelCollectorOtlpHttpConfiguration } from "./config/otlphttp.js"
import { makeOtlpHttpPartialConfig } from "./config/otlphttp.js"
import type { DatadogExporterConfigPartial, OtelCollectorDatadogConfiguration } from "./config/datadog.js"
import { makeDatadogPartialConfig } from "./config/datadog.js"
import type { OtelCollectorNewRelicConfiguration } from "./config/newrelic.js"
import { makeNewRelicPartialConfig } from "./config/newrelic.js"
import type { OtelCollectorBaseConfig } from "./config/base.js"
import { getOtelCollectorBaseConfig } from "./config/base.js"
import type { OtelCollectorHoneycombConfiguration } from "./config/honeycomb.js"
import { makeHoneycombPartialConfig } from "./config/honeycomb.js"
import type { OtelCollectorLoggingConfiguration } from "./config/logging.js"
import { makeLoggingPartialConfig } from "./config/logging.js"

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
