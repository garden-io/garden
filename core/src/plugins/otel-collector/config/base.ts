/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sdk } from "../../../plugin/sdk.js"

const s = sdk.schema

export const baseValidator = s.object({
  name: s.string(),
  enabled: s.boolean(),
})

export type OtelCollectorBaseConfig = {
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
      traces: {
        receivers: ["otlp"]
        processors: ["batch"]
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

export function getOtelCollectorBaseConfig(): OtelCollectorBaseConfig {
  return {
    processors: {
      batch: null,
    },
    exporters: {},
    extensions: {
      health_check: null,
      pprof: null,
      zpages: null,
    },
    service: {
      extensions: [],
      pipelines: {
        traces: {
          receivers: ["otlp"],
          processors: ["batch"],
          exporters: [],
        },
      },
      telemetry: {
        logs: {
          level: "debug",
        },
      },
    },
  }
}
