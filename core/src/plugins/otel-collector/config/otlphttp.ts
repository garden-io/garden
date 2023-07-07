/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export type OtlpHttpExporterName = `otlphttp/${string | number}`

export type OtlpHttpExporterConfigPartial = {
  exporters: {
    [key: OtlpHttpExporterName]:
      | {
          endpoint: string
          headers?: Record<string, string | number | undefined>
        }
      | undefined
  }
  service: {
    pipelines: {
      traces: {
        exporters: OtlpHttpExporterName[]
      }
    }
  }
}

export type OtelCollectorOtlpHttpConfiguration = {
  name: "otlphttp"
  enabled: boolean
  endpoint: string
  headers?: Record<string, string | number | undefined>
}

export const makeOtlpHttpPartialConfig = (() => {
  // We use the counter to make sure every http based config has a unique key
  let counter = 0
  return function (config: OtelCollectorOtlpHttpConfiguration): OtlpHttpExporterConfigPartial {
    counter = counter + 1
    const key: OtlpHttpExporterName = `otlphttp/${counter}`

    return {
      exporters: {
        [key]: {
          endpoint: config.endpoint,
          headers: config.headers,
        },
      },
      service: {
        pipelines: {
          traces: {
            exporters: [key],
          },
        },
      },
    }
  }
})()
