/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import isString from "lodash-es/isString.js"
import type { Log } from "../logger/log-entry.js"
import { defaultVisitorOpts, getContextLookupReferences, visitAll } from "../template/analysis.js"
import { dedent, deline } from "../util/string.js"
import type { ObjectWithName } from "../util/util.js"
import type { StringMap } from "./common.js"
import type { ConfigContext, ContextKeySegment } from "./template-contexts/base.js"
import difference from "lodash-es/difference.js"
import { ConfigurationError } from "../exceptions.js"
import { CONTEXT_RESOLVE_KEY_NOT_FOUND } from "../template/ast.js"

const secretsGuideLink = "https://cloud.docs.garden.io/features/secrets"

function getMessageFooter({ loadedKeys, isLoggedIn }: { loadedKeys: string[]; isLoggedIn: boolean }) {
  if (!isLoggedIn) {
    return `You are not logged in. Log in to get access to Secrets in Garden Cloud. See also ${secretsGuideLink}`
  }

  if (loadedKeys.length === 0) {
    return deline`
      Note: You can manage secrets in Garden Cloud. No secrets have been defined for the current project and environment. See also ${secretsGuideLink}
    `
  } else {
    return `Secret keys with loaded values: ${loadedKeys.join(", ")}`
  }
}

function composeErrorMessage({
  allMissing,
  secrets,
  prefix,
  isLoggedIn,
}: {
  allMissing: [string, ContextKeySegment[]][]
  secrets: StringMap
  prefix: string
  isLoggedIn: boolean
}): string {
  const descriptions = allMissing.map(([key, missing]) => `${prefix} ${key}: ${missing.join(", ")}`)
  /**
   * Secret keys with empty values should have resulted in an error by this point, but we filter on keys with
   * values for good measure.
   */
  const loadedKeys = Object.entries(secrets)
    .filter(([_key, value]) => value)
    .map(([key, _value]) => key)

  const footer = getMessageFooter({ loadedKeys, isLoggedIn })

  const errMsg = dedent`
    The following secret names were referenced in configuration, but are missing from the secrets loaded remotely:

    ${descriptions.join("\n\n")}

    ${footer}
  `
  return errMsg
}

/**
 * Gathers secret references in configs and throws an error if one or more referenced secrets isn't present (or has
 * blank values) in the provided secrets map.
 *
 * Prefix should be e.g. "Module" or "Provider" (used when generating error messages).
 */
export function throwOnMissingSecretKeys({
  configs,
  context,
  secrets,
  prefix,
  isLoggedIn,
  log,
}: {
  configs: ObjectWithName[]
  context: ConfigContext
  secrets: StringMap
  prefix: string
  isLoggedIn: boolean
  cloudBackendDomain: string
  log?: Log
}) {
  const allMissing: [string, ContextKeySegment[]][] = [] // [[key, missing keys]]
  for (const config of configs) {
    const missing = detectMissingSecretKeys({ obj: config, context, secrets })
    if (missing.length > 0) {
      allMissing.push([config.name, missing])
    }
  }

  if (allMissing.length === 0) {
    return
  }

  const errMsg = composeErrorMessage({ allMissing, secrets, prefix, isLoggedIn })
  if (log) {
    log.silly(() => errMsg)
  }

  throw new ConfigurationError({ message: errMsg })
}

/**
 * Collects template references to secrets in obj, and returns an array of any secret keys referenced in it that
 * aren't present (or have blank values) in the provided secrets map.
 */
export function detectMissingSecretKeys({
  obj,
  context,
  secrets,
}: {
  obj: ObjectWithName
  context: ConfigContext
  secrets: StringMap
}): ContextKeySegment[] {
  const requiredKeys: ContextKeySegment[] = []
  const generator = getContextLookupReferences(
    visitAll({
      value: obj,
      opts: defaultVisitorOpts,
    }),
    context,
    {}
  )
  for (const finding of generator) {
    const keyPath = finding.keyPath
    if (keyPath[0] !== "secrets") {
      continue
    }

    const isOptional =
      // see if it evaluates to a default value when the secret is missing
      finding.root.evaluate({
        context,
        opts: {},
        optional: true,
        yamlSource: finding.yamlSource,
      }) !== CONTEXT_RESOLVE_KEY_NOT_FOUND

    if (isOptional) {
      continue
    }

    const secretName = keyPath[1]
    if (isString(secretName)) {
      requiredKeys.push(secretName)
    }
  }

  /**
   * Secret keys with empty values should have resulted in an error by this point, but we filter on keys with
   * values for good measure.
   */
  const keysWithValues = Object.entries(secrets)
    .filter(([_key, value]) => value)
    .map(([key, _value]) => key)
  const missingKeys = difference(requiredKeys, keysWithValues)
  return missingKeys.sort()
}
