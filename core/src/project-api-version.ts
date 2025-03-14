/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { defaultGardenApiVersion, GardenApiVersion } from "./constants.js"
import { RuntimeError } from "./exceptions.js"
import type { ProjectConfig } from "./config/project.js"
import type { Log } from "./logger/log-entry.js"
import { emitNonRepeatableWarning } from "./warnings.js"
import { makeDocsLinkStyled } from "./docs/common.js"
import { reportDeprecatedFeatureUsage } from "./util/deprecations.js"

let projectApiVersionGlobal: GardenApiVersion | undefined

export function getProjectApiVersion(): GardenApiVersion {
  if (!projectApiVersionGlobal) {
    throw new RuntimeError({ message: "apiVersion is not defined" })
  }
  return projectApiVersionGlobal
}

export function setProjectApiVersion(projectConfig: Partial<ProjectConfig>, log: Log) {
  projectApiVersionGlobal = resolveApiVersion(projectConfig, log)
}

export function resolveApiVersion(projectSpec: Partial<ProjectConfig>, log: Log): GardenApiVersion {
  const projectApiVersion = projectSpec.apiVersion

  // We conservatively set the apiVersion to be compatible with 0.12.
  // TODO(0.14): Throw an error if the apiVersion field is not defined.
  if (projectApiVersion === undefined) {
    emitNonRepeatableWarning(
      log,
      `"apiVersion" is missing in the Project config. Assuming "${
        defaultGardenApiVersion
      }" for backwards compatibility with 0.12. The "apiVersion"-field is mandatory when using the new action Kind-configs. A detailed migration guide is available at ${makeDocsLinkStyled("misc/migrating-to-bonsai")}`
    )

    return defaultGardenApiVersion
  }

  if (projectApiVersion !== GardenApiVersion.v2) {
    reportDeprecatedFeatureUsage({
      apiVersion: projectApiVersion,
      log,
      deprecation: "apiVersion",
    })
  }

  return projectApiVersion
}
