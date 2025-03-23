/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DOCS_BASE_URL, GardenApiVersion } from "../constants.js"
import { styles } from "../logger/styles.js"
import { GardenError } from "../exceptions.js"
import { emitNonRepeatableWarning } from "../warnings.js"
import type { Log } from "../logger/log-entry.js"
import { getGlobalProjectApiVersion } from "../project-api-version.js"

const deprecatedPluginNames = [] as const
export type DeprecatedPluginName = (typeof deprecatedPluginNames)[number]

export function isDeprecatedPlugin(pluginName: string): pluginName is DeprecatedPluginName {
  for (const deprecatedPluginName of deprecatedPluginNames) {
    if (deprecatedPluginName === pluginName) {
      return true
    }
  }
  return false
}

// This is called by `updateDeprecationGuide` to update deprecations.md in the docs automatically.
// TODO: uncomment `updateDeprecationGuide` in the docs generator once we have added the first deprecation.
export function getDeprecations(style: (s: string) => string = styles.highlight) {
  return {
    // TODO: add real deprecations for 0.15 here, without dummy deprecation there are type errors.
    dummy: {
      docsSection: "Garden plugins",
      docsHeadline: `${style("container")} provider configuration`,
      warnHint: `The ${style("gardenCloudBuilder")} setting in the ${style("container")} provider configuration has been renamed to ${style("gardenContainerBuilder")}. Use the setting ${style("gardenContainerBuilder")} instead of ${style("gardenCloudBuilder")}.`,
      docs: null,
    },
  } as const
}

export type Deprecation = keyof ReturnType<typeof getDeprecations>

export const DOCS_DEPRECATION_GUIDE = `${DOCS_BASE_URL}/guides/deprecations`
export const DOCS_MIGRATION_GUIDE_CEDAR = `${DOCS_BASE_URL}/guides/migrating-to-cedar`
export const DOCS_MIGRATION_GUIDE_BONSAI = `${DOCS_BASE_URL}/guides/migrating-to-bonsai`

export const CURRENT_MAJOR_VERSION = `0.14`
export const NEXT_MAJOR_VERSION = `the next major release.`

export function makeDeprecationMessage({
  deprecation,
  includeLink,
  style,
}: {
  deprecation: Deprecation
  includeLink?: boolean
  style?: boolean
}) {
  const { docsHeadline, warnHint } = getDeprecations(style ? styles.highlight : (s) => `\`${s}\``)[deprecation]

  const lines: string[] = []
  if (warnHint) {
    lines.push(warnHint)
  } else {
    lines.push(
      `${docsHeadline} is deprecated in ${CURRENT_MAJOR_VERSION} and will be removed in ${NEXT_MAJOR_VERSION}.`
    )
  }

  if (includeLink) {
    let link = `${DOCS_DEPRECATION_GUIDE}#${deprecation.toLowerCase()}`
    if (style) {
      link = styles.link(link)
    }
    lines.push(
      `To make sure your configuration does not break when we release ${NEXT_MAJOR_VERSION}, please follow the steps at ${link}`
    )
  }

  return lines.join("\n")
}

export class FeatureNotAvailable extends GardenError {
  override type = "deprecated-feature-unavailable" as const

  constructor({ link, hint }: { link: string; hint: string }) {
    const lines: string[] = [
      `Configuration error: Rejecting use of deprecated functionality due to the \`apiVersion\` setting in your project-level configuration.`,
    ]

    lines.push(hint)

    lines.push(`Please follow the steps at ${link} to solve this problem.`)

    super({ message: lines.join("\n") })
  }
}

type DeprecationWarningParams = {
  log: Log
  deprecation: Deprecation
}

export function reportDeprecatedFeatureUsage({ log, deprecation }: DeprecationWarningParams) {
  const apiVersion = getGlobalProjectApiVersion()

  const docs = getDeprecations(styles.highlight)[deprecation]

  if (apiVersion === GardenApiVersion.v2) {
    throw new FeatureNotAvailable({
      hint: docs.warnHint,
      link: `${DOCS_DEPRECATION_GUIDE}#${deprecation.toLowerCase()}`,
    })
  }

  const warnMessage = makeDeprecationMessage({ deprecation, includeLink: true, style: true })
  emitNonRepeatableWarning(log, `\nWARNING: ${warnMessage}\n`)
}
