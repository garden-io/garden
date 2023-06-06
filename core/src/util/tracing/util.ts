/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as opentelemetry from "@opentelemetry/sdk-node"

export function prefixWithGardenNamespace(data: opentelemetry.api.Attributes): opentelemetry.api.Attributes {
  const unprefixed = Object.entries(data)

  return Object.fromEntries(
    unprefixed.map(([key, value]) => {
      return [`garden.${key}`, value]
    })
  )
}
