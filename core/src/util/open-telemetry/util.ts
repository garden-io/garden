/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type * as opentelemetry from "@opentelemetry/sdk-node"

/**
 * Automatically prefixes any keys in the input object with `garden.` for attribute namespacing.
 * @param data Input `Attributes` object
 * @returns Prefixed `Attributes` object
 */
export function prefixWithGardenNamespace(data: opentelemetry.api.Attributes): opentelemetry.api.Attributes {
  const unprefixed = Object.entries(data)

  return Object.fromEntries(
    unprefixed.map(([key, value]) => {
      return [`garden.${key}`, value]
    })
  )
}
