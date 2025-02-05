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

export function getDeprecations(style: (s: string) => string = styles.highlight) {
  return {
    containerDeploymentStrategy: {
      contextDesc: "Kubernetes provider configuration",
      featureDesc: `The ${style("deploymentStrategy")} config field`,
      hint: `This field has no effect as the experimental support for blue/green deployments (via the ${style(`"blue-green"`)} strategy) has been removed.`,
    },
    dotIgnoreFiles: {
      contextDesc: "Project configuration",
      featureDesc: `The ${style("dotIgnoreFiles")} config field`,
      hint: `Use the ${style("dotIgnoreFile")} field instead. It only allows specifying one filename.`,
    },
    apiVersionV0: {
      contextDesc: "Project configuration",
      featureDesc: `${style(`apiVersion: ${GardenApiVersion.v0}`)} in the project config`,
      hint: dedent`
      Use ${style(`apiVersion: ${GardenApiVersion.v1}`)} or higher instead.
    `,
    },
    projectConfigModules: {
      contextDesc: "Project configuration",
      featureDesc: `${style("modules")} config field`,
      hint: `Please use the ${style("scan")} field instead.`,
    },
    kubernetesClusterInitCommand: {
      contextDesc: "Garden Commands",
      featureDesc: `Kubernetes plugin command ${style("cluster-init")}`,
      hint: "Do not use this command.",
    },
  } as const
}

export type Deprecation = keyof ReturnType<typeof getDeprecations>

export const DOCS_DEPRECATION_GUIDE = `${DOCS_BASE_URL}/guides/deprecations`

export function makeDeprecationMessage({ deprecation, styleLink }: { deprecation: Deprecation; styleLink?: boolean }) {
  const { featureDesc, hint } = getDeprecations()[deprecation]

  const lines = [`${featureDesc} is deprecated in 0.13 and will be removed in the next major release, Garden 0.14.`]

  if (hint) {
    lines.push(hint)
  }

  let link = `${DOCS_DEPRECATION_GUIDE}#${deprecation}`
  if (styleLink) {
    link = styles.link(link)
  }
  lines.push(
    `To make sure your configuration does not break when we release Garden 0.14, please follow the steps at ${link}`
  )

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

  const warnMessage = makeDeprecationMessage({ deprecation, styleLink: true })
  emitNonRepeatableWarning(log, `\nDEPRECATION WARNING: ${warnMessage}\n`)
}
