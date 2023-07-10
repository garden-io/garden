/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { OtlpHttpExporterConfigPartial, makeOtlpHttpPartialConfig } from "./otlphttp"

export type OtelCollectorHoneycombConfiguration = {
  name: "honeycomb"
  enabled: boolean
  endpoint: string
  apiKey: string
  dataset?: string
}

export function makeHoneycombPartialConfig(config: OtelCollectorHoneycombConfiguration): OtlpHttpExporterConfigPartial {
  return makeOtlpHttpPartialConfig({
    name: "otlphttp",
    enabled: config.enabled,
    endpoint: config.endpoint,
    headers: {
      "x-honeycomb-team": config.apiKey,
      "x-honeycomb-dataset": config.dataset,
    },
  })
}
