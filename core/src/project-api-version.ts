/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { DOCS_BASE_URL, GardenApiVersion } from "./constants.js"
import { ConfigurationError, InternalError } from "./exceptions.js"
import type { ProjectConfig } from "./config/project.js"
import { styles } from "./logger/styles.js"
import { dedent, naturalList } from "./util/string.js"
import { DOCS_DEPRECATION_GUIDE, DOCS_MIGRATION_GUIDE_BONSAI, DOCS_MIGRATION_GUIDE_CEDAR } from "./util/deprecations.js"

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

const gardenVersionMap: Record<GardenApiVersion, string> = {
  [GardenApiVersion.v0]: "0.12 (Acorn)",
  [GardenApiVersion.v1]: "0.13 (Bonsai)",
  [GardenApiVersion.v2]: "0.14 (Cedar)",
}
const migrationGuideMap: Record<GardenApiVersion, string> = {
  [GardenApiVersion.v0]: `0.13 (Bonsai) migration guide at ${DOCS_MIGRATION_GUIDE_BONSAI}`,
  [GardenApiVersion.v1]: `0.14 (Cedar) migration guide at ${DOCS_MIGRATION_GUIDE_CEDAR}`,
  [GardenApiVersion.v2]: `0.14 (Cedar) deprecation guide at ${DOCS_DEPRECATION_GUIDE}`,
}
const LATEST_STABLE_API_VERSION = GardenApiVersion.v2

export function resolveApiVersion(projectSpec: ProjectConfig): GardenApiVersion {
  const projectApiVersion = projectSpec.apiVersion ?? GardenApiVersion.v0

  const projectConfigFile = projectSpec.configPath
  const atLocation = projectConfigFile ? ` at ${projectConfigFile}` : ""

  if (gardenVersionMap[projectApiVersion] === undefined) {
    throw new ConfigurationError({
      message: `You installed ${gardenVersionMap[LATEST_STABLE_API_VERSION]}, but your configuration${atLocation} needs the unsupported ${styles.highlight(`apiVersion: ${projectApiVersion}`)}. Supported values for ${styles.highlight("apiVersion")} are ${naturalList(Object.keys(gardenVersionMap))}.`,
    })
  }

  if (projectApiVersion !== GardenApiVersion.v2) {
    const gardenVersion = gardenVersionMap[projectApiVersion]
    throw new ConfigurationError({
      message: dedent`
      Your configuration${atLocation} has been written for Garden ${gardenVersion}. Your current version of Garden is ${gardenVersionMap[LATEST_STABLE_API_VERSION]}.

      Please follow the ${migrationGuideMap[projectApiVersion]} or downgrade to Garden 0.13 by running ${styles.command("garden self-update <version>")}.
      `,
    })
  }

  return projectApiVersion
}
