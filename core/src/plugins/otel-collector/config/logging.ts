/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { inferType } from "../../../config/zod.js"
import { sdk } from "../../../plugin/sdk.js"
import { baseValidator } from "./base.js"

// Verbosity levels documented in https://github.com/open-telemetry/opentelemetry-collector/blob/main/exporter/loggingexporter/README.md
export type LoggingExporterVerbosityLevel = "detailed" | "normal" | "basic"
export const LoggingExporterVerbosityLevelEnum = [
  "detailed",
  "normal",
  "basic",
] as const satisfies readonly LoggingExporterVerbosityLevel[]

const s = sdk.schema

export const loggingValidator = baseValidator.merge(
  s.object({
    name: s.literal("logging"),
    verbosity: s.enum(LoggingExporterVerbosityLevelEnum).default("normal"),
  })
)

export type LoggingExporterConfigPartial = {
  exporters: {
    logging?: {
      verbosity: LoggingExporterVerbosityLevel
    }
  }
  service: {
    pipelines: {
      traces: {
        exporters: ["logging"]
      }
    }
  }
}

export type OtelCollectorLoggingConfiguration = inferType<typeof loggingValidator>

export function makeLoggingPartialConfig(config: OtelCollectorLoggingConfiguration): LoggingExporterConfigPartial {
  return {
    exporters: {
      logging: {
        verbosity: config.verbosity,
      },
    },
    service: {
      pipelines: {
        traces: {
          exporters: ["logging"],
        },
      },
    },
  }
}
