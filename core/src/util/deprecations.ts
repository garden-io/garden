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
import { dedent, deline } from "./string.js"

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
      docsHeadline: `${style("serviceResource.hotReloadArgs")} configuration field in ${style("kubernetes")} modules`,
      warnHint: deline`
        The ${style("serviceResource.hotReload")} configuration field in ${style("kubernetes")} modules was removed in Garden 0.13 and has no effect.
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
      docsHeadline: `${style("spec.localMode")} configuration field in ${style("helm")}, ${style("kubernetes")} and ${style("container")} Deploy actions`,
      warnHint: deline`
        The local-mode feature was completely removed in 0.14, and the ${style("spec.localMode")} configuration syntax has no effect.
        Please remove all ${style("spec.localMode")} entries from your configuration files.
      `,
      docs: null,
    },
    kubernetesProviderSyncResourceLimit: {
      docsSection: "Old configuration syntax",
      docsHeadline: `${style("resources.sync")} config field in the ${style("kubernetes")} provider`,
      warnHint: deline`
        The ${style("resources.sync")} config field in the ${style("kubernetes")} provider has no effect in Garden 0.13 and 0.14.,
        Please remove it from your ${style("kubernetes")} provider configuration.
      `,
      docs: deline`
        The ${style("resources.sync")} config field in the ${style("kubernetes")} provider was only used for the ${style("cluster-docker")} build mode, which was removed in Garden 0.13.",
      `,
    },
    kubernetesPodSpecFiles: {
      docsSection: "Old configuration syntax",
      docsHeadline: `${style("spec.files")} configuration field in ${style("kubernetes-pod")} action type`,
      warnHint: deline`
        The ${style("spec.files")} configuration field in ${style("kubernetes-pod")} action type has no effect.
        Please remove it and use ${style("spec.manifestFiles")} or ${style("spec.manifestTemplates")} instead.
      `,
      docs: dedent`
        See the reference documentation for details.

        For the ${style("Run")} action kind see [${style("spec.manifestFiles")}](../reference/action-types/Run/kubernetes-pod.md#spec.manifestfiles) and [${style("spec.manifestTemplates")}](../reference/action-types/Run/kubernetes-pod.md#spec.manifesttemplates).
        For the ${style("Test")} action kind see [${style("spec.manifestFiles")}](../reference/action-types/Test/kubernetes-pod.md#spec.manifestfiles) and [${style("spec.manifestTemplates")}](../reference/action-types/Test/kubernetes-pod.md#spec.manifesttemplates).
      `,
    },
    kubernetesPluginCleanupClusterRegistryCommand: {
      docsSection: "Unsupported commands",
      docsHeadline: `${style("cleanup-cluster-registry")}`,
      warnHint: deline`
        The ${style("cleanup-cluster-registry")} command in the ${style("kubernetes")} and ${style("local-kubernetes")} plugins is not supported in Garden 0.14.
        This command no longer has any effect as of version 0.13!
        Please remove this from any pipelines running it.
      `,
      docs: null,
    },
    containerDeployActionLimits: {
      docsSection: "Old configuration syntax",
      docsHeadline: `${style("spec.limits")} configuration field in ${style("container")} Deploy action`,
      warnHint: deline`
        Please use the ${style("cpu")} and ${style("memory")} configuration fields instead.
      `,
      docs: dedent`
        Note! If the deprecated field [${style("spec.limits")}](../reference/action-types/deploy/container#spec.limits)
        explicitly defines any cpu or memory limits in the ${style("container")} Deploy action,
        Garden 0.14 automatically copies the field's contents to the ${style("spec.cpu")} and ${style("spec.memory")},
        even if the latter are defined explicitly.

        Please do not use both ${style("spec.limits")} and ${style("spec.cpu")} and/or ${style("spec.memory")} simultaneously,
        and use only the latter pair of fields. Otherwise, the values from the old field ${style("spec.limits")} will be used.

        See [${style("spec.cpu")}](../reference/action-types/deploy/container#spec.cpu) and [${style("spec.memory")}](../reference/action-types/deploy/container#spec.memory)
      `,
    },
    workflowLimits: {
      docsSection: "Old configuration syntax",
      docsHeadline: `${style("limits")} configuration field in workflows`,
      warnHint: deline`
        Please use the ${style("resources.limits")} configuration field instead.
      `,
      docs: dedent`
        Note! If the deprecated field ${style("limits")} is defined in the workflow config,
        Garden 0.14 automatically copies the field's contents to the ${style("resources.limits")},
        even if the ${style("resources.limits")} is defined explicitly.

        Please do not use both ${style("limits")} and ${style("resources.limits")} simultaneously,
        and use only ${style("resources.limits")}. Otherwise, the values from the old field ${style("limits")} will be used.
      `,
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
