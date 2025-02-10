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
import dedent from "dedent"

const deprecatedPluginNames = ["conftest", "conftest-container", "conftest-kubernetes", "hadolint", "octant"] as const
export type DeprecatedPluginName = (typeof deprecatedPluginNames)[number]

export function isDeprecatedPlugin(pluginName: string): pluginName is DeprecatedPluginName {
  for (const deprecatedPluginName of deprecatedPluginNames) {
    if (deprecatedPluginName === pluginName) {
      return true
    }
  }
  return false
}

function makePluginDeprecation(pluginName: DeprecatedPluginName, style: (s: string) => string) {
  return {
    contextDesc: "Garden Plugins",
    featureDesc: `The plugin ${style(pluginName)}`,
    hint: "This plugin is still enabled by default in Garden 0.13, but will be removed in Garden 0.14. Do not use this plugin explicitly in Garden 0.14.",
    hintReferenceLink: null,
  }
}

export function getDeprecations(style: (s: string) => string = styles.highlight) {
  return {
    containerDeploymentStrategy: {
      contextDesc: "Kubernetes provider configuration",
      featureDesc: `The ${style("deploymentStrategy")} config field`,
      hint: `Do not use this config field. It has no effect as the experimental support for blue/green deployments (via the ${style(`blue-green`)} strategy) has been removed.`,
      hintReferenceLink: null,
    },
    dotIgnoreFiles: {
      contextDesc: "Project configuration",
      featureDesc: `The ${style("dotIgnoreFiles")} config field`,
      hint: `Use the ${style("dotIgnoreFile")} field instead. It only allows specifying one filename.`,
      hintReferenceLink: {
        name: `${style("dotIgnoreFile")} reference documentation`,
        link: `reference/project-config.md#dotignorefile`,
      },
    },
    apiVersionV0: {
      contextDesc: "Project configuration",
      featureDesc: `Using ${style(`apiVersion: ${GardenApiVersion.v0}`)} in the project config`,
      hint: dedent`
      Use ${style(`apiVersion: ${GardenApiVersion.v1}`)} or higher instead.
      `,
      hintReferenceLink: {
        name: `${style("apiVersion")} reference documentation`,
        link: `reference/project-config.md#apiVersion`,
      },
    },
    projectConfigModules: {
      contextDesc: "Project configuration",
      featureDesc: `The ${style("modules")} config field`,
      hint: `Please use the ${style("scan")} field instead.`,
      hintReferenceLink: {
        name: `${style("scan")} reference documentation`,
        link: `reference/project-config.md#scan`,
      },
    },
    kubernetesClusterInitCommand: {
      contextDesc: "Garden Commands",
      featureDesc: `The Kubernetes plugin command ${style("cluster-init")}`,
      hint: "Do not use this command. It has no effect.",
      hintReferenceLink: null,
    },
    hadolintPlugin: makePluginDeprecation("hadolint", style),
    octantPlugin: makePluginDeprecation("octant", style),
    conftestPlugin: makePluginDeprecation("conftest", style),
    localMode: {
      contextDesc: "Local mode",
      featureDesc: `The ${style("local mode")} feature for container, kubernetes and helm deploys`,
      hint: "Please do not use this in Garden 0.14",
      hintReferenceLink: null,
    },
    buildConfigFieldOnRuntimeActions: {
      contextDesc: "Acton Configs",
      featureDesc: `The ${style("build")} config field in runtime action configs`,
      hint: `Use ${style("dependencies")} config build to define the build dependencies.`,
      hintReferenceLink: null,
    },
  } as const
}

export type Deprecation = keyof ReturnType<typeof getDeprecations>

export const DOCS_DEPRECATION_GUIDE = `${DOCS_BASE_URL}/guides/deprecations`

export function makeDeprecationMessage({
  deprecation,
  includeLink,
  style,
}: {
  deprecation: Deprecation
  includeLink?: boolean
  style?: boolean
}) {
  const { featureDesc, hint } = getDeprecations(style ? styles.highlight : (s) => `\`${s}\``)[deprecation]

  const lines = [`${featureDesc} is deprecated in 0.13 and will be removed in the next major release, Garden 0.14.`]

  if (hint) {
    lines.push(hint)
  }

  if (includeLink) {
    let link = `${DOCS_DEPRECATION_GUIDE}#${deprecation}`
    if (style) {
      link = styles.link(link)
    }
    lines.push(
      `To make sure your configuration does not break when we release Garden 0.14, please follow the steps at ${link}`
    )
  }

  return lines.join("\n")
}

class FeatureNotAvailable extends GardenError {
  override type = "deprecated-feature-unavailable" as const

  constructor({ deprecation, apiVersion }: { deprecation: Deprecation; apiVersion: GardenApiVersion }) {
    const { featureDesc, hint } = getDeprecations()[deprecation]
    const lines = [
      `${featureDesc} has been deprecated and is not available when using ${styles.highlight(`apiVersion: ${apiVersion}`)} in your project configuration file.`,
    ]

    if (hint) {
      lines.push(hint)
    }

    const link = styles.link(DOCS_DEPRECATION_GUIDE)
    lines.push(
      `Avoiding to use this feature will ensure that your configuration does not break when we release Garden 0.14. For more information, see ${link}`
    )

    super({ message: lines.join("\n") })
  }
}

type DeprecationWarningParams = {
  apiVersion: GardenApiVersion
  log: Log
  deprecation: Deprecation
}

export function reportDeprecatedFeatureUsage({ apiVersion, log, deprecation }: DeprecationWarningParams) {
  if (apiVersion === GardenApiVersion.v2) {
    throw new FeatureNotAvailable({ apiVersion, deprecation })
  }

  const warnMessage = makeDeprecationMessage({ deprecation, includeLink: true, style: true })
  emitNonRepeatableWarning(log, `\nDEPRECATION WARNING: ${warnMessage}\n`)
}
