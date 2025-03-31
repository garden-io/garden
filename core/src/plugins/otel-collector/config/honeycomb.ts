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

export const honeycombValidator = baseValidator.merge(
  s.object({
    name: s.literal("honeycomb"),
    endpoint: s.string().url().default("https://api.honeycomb.io"),
    apiKey: s.string().min(1),
    dataset: s.string().optional(),
  })
)

export type OtelCollectorHoneycombConfiguration = inferType<typeof honeycombValidator>

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
