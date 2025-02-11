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

export const DOCS_DEPRECATION_GUIDE = `${DOCS_BASE_URL}/guides/deprecations`

/**
 * Guard type to separate V1 and V2 deprecations,
 * and to make sure that each one has the valid `apiVersion` tag.
 *
 * Separation of V1 and V2 deprecations makes sense,
 * because those will be handled differently in the code and the generated docs.
 *
 * This causes some awkward and repeatable code in this file,
 * but allows to separate the V1 and V2 deprecation on the declaration level,
 * instead of filtering those on the caller site.
 *
 * The `apiVersion` tagging allows to re-use some deprecation construction machinery here,
 * and encapsulate it completely in this file.
 *
 * This also allows to expose independent getters for V1 and V2 deprecations,
 * those will be used in the docs generator and rendered into different sections.
 */
type DeprecationShape<T extends GardenApiVersion> = {
  contextDesc: string
  featureDesc: string
  hint: string
  hintReferenceLink: null | {
    name: string
    link: string
  }
  apiVersion: T
}

///// Deprecation machinery for `apiVersion: garden.io/v1` /////

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

function makePluginApiV1Deprecation(pluginName: DeprecatedPluginName, style: (s: string) => string) {
  return {
    contextDesc: "Garden Plugins",
    featureDesc: `The plugin ${style(pluginName)}`,
    hint: "This plugin is still enabled by default in Garden 0.13, but will be removed in Garden 0.14. Do not use this plugin explicitly in Garden 0.14.",
    hintReferenceLink: null,
    apiVersion: GardenApiVersion.v1,
  } satisfies ApiV1DeprecationShape
}

/**
 * Guard type to make sure that all V1 deprecations have the valid `apiVersion` tag.
 */
type ApiV1DeprecationShape = DeprecationShape<GardenApiVersion.v1>

export function getApiV1Deprecations(style: (s: string) => string = styles.highlight) {
  return {
    containerDeploymentStrategy: {
      contextDesc: "Kubernetes provider configuration",
      featureDesc: `The ${style("deploymentStrategy")} config field`,
      hint: `Do not use this config field. It has no effect as the experimental support for blue/green deployments (via the ${style(`blue-green`)} strategy) has been removed.`,
      hintReferenceLink: null,
      apiVersion: GardenApiVersion.v1,
    } satisfies ApiV1DeprecationShape,
    dotIgnoreFiles: {
      contextDesc: "Project configuration",
      featureDesc: `The ${style("dotIgnoreFiles")} config field`,
      hint: `Use the ${style("dotIgnoreFile")} field instead. It only allows specifying one filename.`,
      hintReferenceLink: {
        name: `${style("dotIgnoreFile")} reference documentation`,
        link: `reference/project-config.md#dotignorefile`,
      },
      apiVersion: GardenApiVersion.v1,
    } satisfies ApiV1DeprecationShape,
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
      apiVersion: GardenApiVersion.v1,
    } satisfies ApiV1DeprecationShape,
    projectConfigModules: {
      contextDesc: "Project configuration",
      featureDesc: `The ${style("modules")} config field`,
      hint: `Please use the ${style("scan")} field instead.`,
      hintReferenceLink: {
        name: `${style("scan")} reference documentation`,
        link: `reference/project-config.md#scan`,
      },
      apiVersion: GardenApiVersion.v1,
    } satisfies ApiV1DeprecationShape,
    kubernetesClusterInitCommand: {
      contextDesc: "Garden Commands",
      featureDesc: `The Kubernetes plugin command ${style("cluster-init")}`,
      hint: "Do not use this command. It has no effect.",
      hintReferenceLink: null,
      apiVersion: GardenApiVersion.v1,
    },
    hadolintPlugin: makePluginApiV1Deprecation("hadolint", style),
    octantPlugin: makePluginApiV1Deprecation("octant", style),
    conftestPlugin: makePluginApiV1Deprecation("conftest", style),
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
      hintReferenceLink: {
        name: "Migration guide for action configs",
        link: "#updating-action-configs",
      },
      apiVersion: GardenApiVersion.v1,
    } satisfies ApiV1DeprecationShape,
    rsyncBuildStaging: {
      contextDesc: "Build Staging",
      featureDesc: `The ${style("legacy rsync-based file syncing")} for build staging`,
      hint: `Do not use ${style("`GARDEN_LEGACY_BUILD_STAGE`")} environment variable in 0.14.`,
      hintReferenceLink: null,
      apiVersion: GardenApiVersion.v1,
    } satisfies ApiV1DeprecationShape,
  } as const
}

export type ApiV1Deprecation = keyof ReturnType<typeof getApiV1Deprecations>

export function makeApiV1DeprecationMessage({
  deprecation,
  includeLink,
  style,
}: {
  deprecation: ApiV1Deprecation
  includeLink?: boolean
  style?: boolean
}) {
  return makeDeprecationMessage({ apiVersion: GardenApiVersion.v1, deprecation, includeLink, style })
}

class FeatureNotAvailable extends GardenError {
  override type = "deprecated-feature-unavailable" as const

  constructor({ deprecation, apiVersion }: { deprecation: ApiV1Deprecation; apiVersion: GardenApiVersion }) {
    const { featureDesc, hint } = getApiV1Deprecations()[deprecation]
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

/**
 * Prints deprecation warning for `apiVersion: garden.io/v1`
 * and throws and error for `apiVersion: garden.io/v2`.
 *
 * To be used to inform users about the upcoming breaking changes in 0.14.
 */
export function reportApiV1DeprecatedFeatureUsage({
  apiVersion,
  log,
  deprecation,
}: {
  apiVersion: GardenApiVersion
  log: Log
  deprecation: ApiV1Deprecation
}) {
  if (apiVersion === GardenApiVersion.v2) {
    throw new FeatureNotAvailable({ apiVersion, deprecation })
  }

  const warnMessage = makeApiV1DeprecationMessage({ deprecation, includeLink: true, style: true })
  emitNonRepeatableWarning(log, `\nDEPRECATION WARNING: ${warnMessage}\n`)
}

///// Deprecation machinery for `apiVersion: garden.io/v2` /////

/**
 * Guard type to make sure that all V2 deprecations have the valid `apiVersion` tag.
 */
type ApiV2DeprecationShape = DeprecationShape<GardenApiVersion.v2>

export function getApiV2Deprecations(style: (s: string) => string = styles.highlight) {
  return {
    containerDeployAction: {
      contextDesc: "Garden Action Types",
      featureDesc: `The ${style("container Deploy")} action type`,
      hint: `Consider using ${style("kubernetes Deploy")} action type instead.`,
      hintReferenceLink: null, // TODO(0.14): create migration guide and link it
      apiVersion: GardenApiVersion.v2,
    } satisfies ApiV2DeprecationShape,
  } as const
}

export type ApiV2Deprecation = keyof ReturnType<typeof getApiV2Deprecations>

export function makeApiV2DeprecationMessage({
  deprecation,
  includeLink,
  style,
}: {
  deprecation: ApiV2Deprecation
  includeLink?: boolean
  style?: boolean
}) {
  return makeDeprecationMessage({ apiVersion: GardenApiVersion.v2, deprecation, includeLink, style })
}

/**
 * Prints deprecation warning for `apiVersion: garden.io/v2`
 * and has no effect for `apiVersion: garden.io/v1` or older.
 *
 * To be used to inform users about the upcoming breaking changes in 0.14.
 */
export function reportApiV2DeprecatedFeatureUsage({
  apiVersion,
  log,
  deprecation,
}: {
  apiVersion: GardenApiVersion
  log: Log
  deprecation: ApiV2Deprecation
}) {
  if (apiVersion !== GardenApiVersion.v2) {
    return
  }

  const warnMessage = makeApiV2DeprecationMessage({ deprecation, includeLink: true, style: true })
  emitNonRepeatableWarning(log, `\nDEPRECATION WARNING: ${warnMessage}\n`)
}

///// Shared parts /////

function pickDeprecationDetails({
  apiVersion,
  deprecation,
  style,
}: {
  apiVersion: GardenApiVersion.v1 | GardenApiVersion.v2
  deprecation: ApiV1Deprecation | ApiV2Deprecation
  includeLink?: boolean
  style?: boolean
}) {
  if (apiVersion === GardenApiVersion.v1) {
    const { featureDesc, hint } = getApiV1Deprecations(style ? styles.highlight : (s) => `\`${s}\``)[
      deprecation as ApiV1Deprecation
    ]
    return { featureDesc, hint, prevVersion: "0.13", nextVersion: "0.14" }
  } else if (apiVersion === GardenApiVersion.v2) {
    const { featureDesc, hint } = getApiV2Deprecations(style ? styles.highlight : (s) => `\`${s}\``)[
      deprecation as ApiV2Deprecation
    ]
    return { featureDesc, hint, prevVersion: "0.14", nextVersion: "0.15" }
  } else {
    return apiVersion satisfies never
  }
}

export function makeDeprecationMessage({
  apiVersion,
  deprecation,
  includeLink,
  style,
}: {
  apiVersion: GardenApiVersion.v1 | GardenApiVersion.v2
  deprecation: ApiV1Deprecation | ApiV2Deprecation
  includeLink?: boolean
  style?: boolean
}) {
  const { featureDesc, hint, prevVersion, nextVersion } = pickDeprecationDetails({ apiVersion, deprecation, style })

  const lines = [
    `${featureDesc} is deprecated in ${prevVersion} and will be removed in the next major release, Garden ${nextVersion}.`,
  ]

  if (hint) {
    lines.push(hint)
  }

  if (includeLink) {
    let link = `${DOCS_DEPRECATION_GUIDE}#${deprecation}`
    if (style) {
      link = styles.link(link)
    }
    lines.push(
      `To make sure your configuration does not break when we release Garden ${nextVersion}, please follow the steps at ${link}`
    )
  }

  return lines.join("\n")
}
