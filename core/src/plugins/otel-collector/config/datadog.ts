/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { hostname } from "os"

export type DatadogExporterConfigPartial = {
  exporters: {
    datadog?: {
      api: {
        site: string
        key: string
        fail_on_invalid_key?: boolean
      }
      hostname?: string
    }
  }
  service: {
    pipelines: {
      traces: {
        exporters: ["datadog"]
      }
    }
  }
}

export type OtelCollectorDatadogConfiguration = {
  name: "datadog"
  enabled: boolean
  site: string
  apiKey: string
}

export function makeDatadogPartialConfig(config: OtelCollectorDatadogConfiguration): DatadogExporterConfigPartial {
  return {
    exporters: {
      datadog: {
        api: {
          site: config.site,
          key: config.apiKey,
          fail_on_invalid_key: true,
        },
        // Hardcoded here due to performance problems with provider init
        // See https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/16442
        hostname: hostname(),
      },
    },
    service: {
      pipelines: {
        traces: {
          exporters: ["datadog"],
        },
      },
    },
  }
}
