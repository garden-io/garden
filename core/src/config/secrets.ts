/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import isString from "lodash-es/isString.js"
import type { Log } from "../logger/log-entry.js"
import { getContextLookupReferences, visitAll } from "../template/analysis.js"
import { dedent, deline } from "../util/string.js"
import type { ObjectWithName } from "../util/util.js"
import type { StringMap } from "./common.js"
import type { ConfigContext, ContextKeySegment } from "./template-contexts/base.js"
import difference from "lodash-es/difference.js"
import { ConfigurationError } from "../exceptions.js"
import { flatten, uniq } from "lodash-es"

/**
 * Gathers secret references in configs and throws an error if one or more referenced secrets isn't present (or has
 * blank values) in the provided secrets map.
 *
 * Prefix should be e.g. "Module" or "Provider" (used when generating error messages).
 */
export function throwOnMissingSecretKeys(
  configs: ObjectWithName[],
  context: ConfigContext,
  secrets: StringMap,
  prefix: string,
  log?: Log
) {
  const allMissing: [string, ContextKeySegment[]][] = [] // [[key, missing keys]]
  for (const config of configs) {
    const missing = detectMissingSecretKeys(config, context, secrets)
    if (missing.length > 0) {
      allMissing.push([config.name, missing])
    }
  }

  if (allMissing.length === 0) {
    return
  }

  const descriptions = allMissing.map(([key, missing]) => `${prefix} ${key}: ${missing.join(", ")}`)
  /**
   * Secret keys with empty values should have resulted in an error by this point, but we filter on keys with
   * values for good measure.
   */
  const loadedKeys = Object.entries(secrets)
    .filter(([_key, value]) => value)
    .map(([key, _value]) => key)
  let footer: string
  if (loadedKeys.length === 0) {
    footer = deline`
      Note: No secrets have been loaded. If you have defined secrets for the current project and environment in Garden
      Cloud, this may indicate a problem with your configuration.
    `
  } else {
    footer = `Secret keys with loaded values: ${loadedKeys.join(", ")}`
  }
  const errMsg = dedent`
    The following secret names were referenced in configuration, but are missing from the secrets loaded remotely:

    ${descriptions.join("\n\n")}

    ${footer}
  `
  if (log) {
    log.silly(() => errMsg)
  }
  throw new ConfigurationError({ message: errMsg })
}

/**
 * Collects template references to secrets in obj, and returns an array of any secret keys referenced in it that
 * aren't present (or have blank values) in the provided secrets map.
 */
export function detectMissingSecretKeys(
  obj: ObjectWithName,
  context: ConfigContext,
  secrets: StringMap
): ContextKeySegment[] {
  const referencedKeys: ContextKeySegment[] = []
  const generator = getContextLookupReferences(
    visitAll({
      value: obj,
    }),
    context
  )
  for (const finding of generator) {
    const keyPath = finding.keyPath
    if (keyPath[0] !== "secrets") {
      continue
    }

    const secretName = keyPath[1]
    if (isString(secretName)) {
      referencedKeys.push(secretName)
    }
  }

  /**
   * Secret keys with empty values should have resulted in an error by this point, but we filter on keys with
   * values for good measure.
   */
  const keysWithValues = Object.entries(secrets)
    .filter(([_key, value]) => value)
    .map(([key, _value]) => key)
  const missingKeys = difference(referencedKeys, keysWithValues)
  return missingKeys.sort()
}
