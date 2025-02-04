/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "./logger/log-entry.js"
import { dedent, deline } from "./util/string.js"
import { DOCS_BASE_URL, GardenApiVersion } from "./constants.js"
import { ConfigurationError } from "./exceptions.js"
import { styles } from "./logger/styles.js"

interface LoggerContext {
  readonly history: Set<string>
}

const loggerContext: LoggerContext = {
  history: new Set<string>(),
}

export function resetNonRepeatableWarningHistory() {
  loggerContext.history.clear()
}

export function emitNonRepeatableWarning(log: Log, message: string) {
  if (loggerContext.history.has(message)) {
    return
  }

  log.warn(message)
  loggerContext.history.add(message)
}

type DeprecationWarningParams = {
  apiVersion: GardenApiVersion
  log: Log
  featureDesc: string
  hint: string
}

const migrationGuideReference = deline`
See Garden 0.14 Migration Guide at ${styles.link(`${DOCS_BASE_URL}/guides/migrating-to-0.14`)} for more details on the migration from 0.13 to 0.14.
`

function makeWarningFor_0_13({ featureDesc, hint }: { featureDesc: string; hint?: string }): string {
  // add newline delimiter only if the sections are not empty
  const warnMessage = !!featureDesc ? `\n${featureDesc} is deprecated in 0.13 and will be removed in 0.14.` : ""
  const hintAppendix = !!hint ? `\n${hint}` : ""
  return dedent`
  ${styles.bold("!!!!!!!!!!!!!!!!!!!! [DEPRECATION WARNING] !!!!!!!!!!!!!!!!!!!!")}${warnMessage}${hintAppendix}
  ${migrationGuideReference}
  `
}

function makeErrorFor_0_14({ featureDesc, hint }: { featureDesc: string; hint?: string }): string {
  // add newline delimiter only if the sections are not empty
  const errMessage = !!featureDesc ? `\n${featureDesc} has been removed in 0.14.` : ""
  const hintAppendix = !!hint ? `\n${hint}` : ""
  return dedent`
  ${errMessage}${hintAppendix}
  ${migrationGuideReference}
  `
}

export function reportDeprecatedFeatureUsage({ apiVersion, log, featureDesc, hint }: DeprecationWarningParams) {
  if (apiVersion === GardenApiVersion.v2) {
    const message = makeErrorFor_0_14({ featureDesc, hint })
    // TODO: consider a separate error type?
    throw new ConfigurationError({ message })
  }

  const warnMessage = makeWarningFor_0_13({ featureDesc, hint })
  emitNonRepeatableWarning(log, warnMessage)
}
