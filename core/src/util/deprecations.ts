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

const DOCS_DEPRECATION_GUIDE = `${DOCS_BASE_URL}/guides/deprecations`

export function makeDeprecationMessage({
  featureDesc,
  hint,
  styleLink,
}: {
  featureDesc: string
  hint?: string
  styleLink?: boolean
}) {
  const lines = [`${featureDesc} is deprecated in 0.13 and will be removed in the next major release, Garden 0.14.`]

  if (hint) {
    lines.push(hint)
  }

  let link = DOCS_DEPRECATION_GUIDE
  if (styleLink) {
    link = styles.link(link)
  }
  lines.push(
    `To make sure your configuration does not break when when we release Garden 0.14, please follow the steps at ${link}`
  )

  return lines.join("\n\n")
}

class FeatureNotAvailable extends GardenError {
  override type = "deprecated-feature-unavailable" as const

  constructor({ featureDesc, hint, apiVersion }: { featureDesc: string; hint?: string; apiVersion: GardenApiVersion }) {
    const lines = [
      `${featureDesc} has been deprecated and is not available when using ${styles.highlight(`\`apiVersion: ${apiVersion}\``)} in your project configuration file.`,
    ]

    if (hint) {
      lines.push(hint)
    }

    const link = styles.link(DOCS_DEPRECATION_GUIDE)
    lines.push(
      `Avoiding to use this feature will ensure that your configuration does not break when we release Garden 0.14. For more information, see ${link}`
    )

    super({ message: lines.join("\n\n") })
  }
}

type DeprecationWarningParams = {
  apiVersion: GardenApiVersion
  log: Log
  deprecation: {
    featureDesc: string
    hint: string
  }
}
export function reportDeprecatedFeatureUsage({ apiVersion, log, deprecation }: DeprecationWarningParams) {
  if (apiVersion === GardenApiVersion.v2) {
    throw new FeatureNotAvailable({ apiVersion, ...deprecation })
  }

  const warnMessage = makeDeprecationMessage({ ...deprecation, styleLink: true })
  emitNonRepeatableWarning(log, `DEPRECATION WARNING: ${warnMessage}`)
}

export const DEPRECATIONS = {
  containerDeploymentStrategy: {
    featureDesc: "The `deploymentStrategy` config field",
    hint: `This field has no effect as the experimental support for blue/green deployments (via the \`"blue-green"\` strategy) has been removed.`,
  },
  dotIgnoreFiles: {
    featureDesc: "The `dotIgnoreFiles` config field",
    hint: "Use the `dotIgnoreFile` field instead. It only allows specifying one filename.",
  },
  apiVersionV0: {
    featureDesc: `${styles.highlight(`apiVersion: ${GardenApiVersion.v0}`)} in the project config`,
    hint: dedent`
      Use ${styles.highlight(`apiVersion: ${GardenApiVersion.v1}`)} or higher instead.
    `,
  },
  projectConfigModules: {
    featureDesc: `Project configuration field ${styles.highlight("modules")}`,
    hint: `Please use the ${styles.highlight("scan")} field instead.`,
  },
  kubernetesClusterInitCommand: {
    featureDesc: `Kubernetes plugin command ${styles.highlight("cluster-init")}`,
    hint: "Do not use this command.",
  },
}
