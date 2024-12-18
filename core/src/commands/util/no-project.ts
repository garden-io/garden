/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Garden } from "../../garden.js"
import type { Log } from "../../logger/log-entry.js"
import type { ProjectConfig } from "../../config/project.js"
import { findProjectConfig } from "../../config/base.js"
import { ConfigurationError } from "../../exceptions.js"

/**
 * Derive the Cloud domain from the project configuration if any available.
 *
 * To be used by commands with `noProject = true`.
 * For such commands do the project config is not initialized  in the `Garden` class,
 * so we need to read it in here to get the cloud domain.
 *
 * The Cloud API is also missing for the commands with `noProject = true`.
 * So, the cloud domain derived here should be used to initialize the Cloud API.
 */
export async function deriveCloudDomainForNoProjectCommand({
  disableProjectCheck,
  garden,
  log,
}: {
  disableProjectCheck: boolean
  garden: Garden
  log: Log
}): Promise<string | undefined> {
  let projectConfig: ProjectConfig | undefined = undefined
  const forceProjectCheck = !disableProjectCheck

  if (forceProjectCheck) {
    projectConfig = await findProjectConfig({ log, path: garden.projectRoot })

    // Fail if this is not run within a garden project
    if (!projectConfig) {
      throw new ConfigurationError({
        message: `Not a project directory (or any of the parent directories): ${garden.projectRoot}`,
      })
    }
  }

  return projectConfig?.domain
}
