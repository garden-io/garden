/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { OtlpHttpExporterConfigPartial } from "./otlphttp.js"
import { makeOtlpHttpPartialConfig } from "./otlphttp.js"
import { sdk } from "../../../plugin/sdk.js"
import { baseValidator } from "./base.js"
import type { inferType } from "../../../config/zod.js"

const s = sdk.schema

export const newRelicValidator = baseValidator.merge(
  s.object({
    name: s.literal("newrelic"),
    endpoint: s.string().url().default("https://otlp.nr-data.net:4318"),
    apiKey: s.string().min(1),
  })
)

export type OtelCollectorNewRelicConfiguration = inferType<typeof newRelicValidator>

export function makeNewRelicPartialConfig(config: OtelCollectorNewRelicConfiguration): OtlpHttpExporterConfigPartial {
  return makeOtlpHttpPartialConfig({
    name: "otlphttp",
    enabled: config.enabled,
    endpoint: config.endpoint,
    headers: {
      "api-key": config.apiKey,
    },
  })
}
