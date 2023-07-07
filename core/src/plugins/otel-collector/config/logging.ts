/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export type LoggingExporterVerbosityLevel = "detailed" | "normal" | "basic"
export const LoggingExporterVerbosityLevelEnum = [
  "detailed",
  "normal",
  "basic",
] as const satisfies readonly LoggingExporterVerbosityLevel[]

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

export type OtelCollectorLoggingConfiguration = {
  name: "logging"
  enabled: boolean
  verbosity: LoggingExporterVerbosityLevel
}

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
