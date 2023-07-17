/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { OtlpHttpExporterConfigPartial, makeOtlpHttpPartialConfig } from "./otlphttp"
import { sdk } from "../../../plugin/sdk"
import { baseValidator } from "./base"
import { inferType } from "../../../config/zod"

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
