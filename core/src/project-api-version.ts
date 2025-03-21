/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { GardenApiVersion } from "./constants.js"
import { ConfigurationError, RuntimeError } from "./exceptions.js"
import type { ProjectConfig } from "./config/project.js"
import type { Log } from "./logger/log-entry.js"

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

const gardenVersionMap: Record<GardenApiVersion, string> = {
  [GardenApiVersion.v0]: "0.12 (Acorn)",
  [GardenApiVersion.v1]: "0.13 (Bonsai)",
  [GardenApiVersion.v2]: "0.14 (Cedar)",
}

export function resolveApiVersion(projectSpec: Partial<ProjectConfig>, _log: Log): GardenApiVersion {
  const projectApiVersion = projectSpec.apiVersion || GardenApiVersion.v0

  if (projectApiVersion !== GardenApiVersion.v2) {
    const gardenVersion = gardenVersionMap[projectApiVersion]
    throw new ConfigurationError({
      // TODO: add a link to the migration guide
      message: `Your configuration has been written for Garden ${gardenVersion}. Your current version of Garden is ${gardenVersionMap[GardenApiVersion.v2]}.`,
    })
  }

  return projectApiVersion
}
