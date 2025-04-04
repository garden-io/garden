/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DOCS_BASE_URL } from "../constants.js"
import { styles } from "../logger/styles.js"
import { GardenError } from "../exceptions.js"
import { emitNonRepeatableWarning } from "../warnings.js"
import type { Log } from "../logger/log-entry.js"
import { deline } from "./string.js"

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
export function getDeprecations(style: (s: string) => string = styles.highlight) {
  return {
    hotReload: {
      docsSection: "Old configuration syntax",
      docsHeadline: `${style("hotReload")} configuration field in modules`,
      warnHint: deline`
        The module-level ${style("hotReload")} configuration field was removed in Garden 0.13 and has no effect.
        Please use actions with the ${style("sync")} mode instead.
      `,
      docs: deline`
        See the [Code Synchronization Guide](../features/code-synchronization.md) for details.
      `,
    },
    hotReloadArgs: {
      docsSection: "Old configuration syntax",
      docsHeadline: `${style("serviceResource.hotReloadArgs")} configuration field in modules`,
      warnHint: deline`
        The module-level ${style("serviceResource.hotReload")} configuration field was removed in Garden 0.13 and has no effect.
        Please use actions with the ${style("sync")} mode instead.
      `,
      // TODO: add "See also the [deprecation notice for ${style("hotReload")} configuration field in modules](#hotreload)."
      //  Now check-docs does not recognize the anchor links.
      docs: deline`
        See the [Code Synchronization Guide](../features/code-synchronization.md) for details.
      `,
    },
    devMode: {
      docsSection: "Old configuration syntax",
      docsHeadline: `${style("spec.devMode")} configuration field in actions`,
      warnHint: deline`
        The ${style("spec.devMode")} configuration field in actions is deprecated in Garden 0.14.
        Please use ${style("spec.sync")} configuration field instead.
      `,
      docs: deline`
        The old fields ${style("spec.devMode")} are automatically converted to ${style("spec.sync")} in Garden 0.14 when using ${style("apiVersion: garden.io/v2")} in the project-level configuration.
      `,
    },
    localMode: {
      docsSection: "Old configuration syntax",
      docsHeadline: `${style("spec.localMode")} in ${style("helm")}, ${style("kubernetes")} and ${style("container")} Deploy actions`,
      warnHint: deline`
        The local-mode feature was completely removed in 0.14, and the ${style("spec.localMode")} configuration syntax has no effect.
        Please remove all ${style("spec.localMode")} entries from your configuration files.
      `,
      docs: null,
    },
  } as const
}

export type Deprecation = keyof ReturnType<typeof getDeprecations>

export const DOCS_DEPRECATION_GUIDE = `${DOCS_BASE_URL}/misc/deprecations`
export const DOCS_MIGRATION_GUIDE_CEDAR = `${DOCS_BASE_URL}/misc/migrating-to-cedar`
export const DOCS_MIGRATION_GUIDE_BONSAI = `${DOCS_BASE_URL}/misc/migrating-to-bonsai`

export const CURRENT_MAJOR_VERSION = `0.14`
export const NEXT_MAJOR_VERSION = `the next major release`

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
  // TODO: throw it for GardenApiVersion.v3
  // const apiVersion = getGlobalProjectApiVersion()
  // const docs = getDeprecations(styles.highlight)[deprecation]
  // if (apiVersion === GardenApiVersion.v2) {
  //   throw new FeatureNotAvailable({
  //     hint: docs.warnHint,
  //     link: `${DOCS_DEPRECATION_GUIDE}#${deprecation.toLowerCase()}`,
  //   })
  // }

  const warnMessage = makeDeprecationMessage({ deprecation, includeLink: true, style: true })
  emitNonRepeatableWarning(log, `\nWARNING: ${warnMessage}\n`)
}
