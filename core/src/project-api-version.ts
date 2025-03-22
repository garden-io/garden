/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { GardenApiVersion } from "./constants.js"
import { InternalError } from "./exceptions.js"
import type { ProjectConfig } from "./config/project.js"
import type { Log } from "./logger/log-entry.js"
import { emitNonRepeatableWarning } from "./warnings.js"
import { makeDocsLinkStyled } from "./docs/common.js"
import { reportDeprecatedFeatureUsage } from "./util/deprecations.js"

let projectApiVersionGlobal: GardenApiVersion | undefined

export function getGlobalProjectApiVersion(): GardenApiVersion {
  if (!projectApiVersionGlobal) {
    throw new InternalError({ message: "apiVersion is not defined" })
  }
  return projectApiVersionGlobal
}

export function setGloablProjectApiVersion(apiVersion: GardenApiVersion) {
  projectApiVersionGlobal = apiVersion
}

export function resolveApiVersion(projectSpec: ProjectConfig, log: Log): GardenApiVersion {
  const declaredApiVersion = projectSpec.apiVersion

  const resolvedApiVersion = declaredApiVersion || GardenApiVersion.v0

  // We conservatively set the apiVersion to be compatible with 0.12.
  // TODO(0.14): Throw an error if the apiVersion field is not defined.
  if (declaredApiVersion === undefined) {
    emitNonRepeatableWarning(
      log,
      `"apiVersion" is missing in the Project config. Assuming "${
        resolvedApiVersion
      }" for backwards compatibility with 0.12. The "apiVersion"-field is mandatory when using the new action Kind-configs. A detailed migration guide is available at ${makeDocsLinkStyled("guides/migrating-to-bonsai")}`
    )
  }

  // HACK: Set project API version globally.
  // This makes it easier to use `reportDeprecatedFeatureUsage`, as it can be difficult at times to pass down the apiVersion
  setGloablProjectApiVersion(resolvedApiVersion)

  if (declaredApiVersion !== GardenApiVersion.v2) {
    // Print the deprecation warning that 0.14 will only support apiVersion v2
    reportDeprecatedFeatureUsage({
      log,
      deprecation: "apiVersion",
    })
  }

  return resolvedApiVersion
}
