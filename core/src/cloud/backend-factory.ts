/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ProjectConfig } from "../config/project.js"
import { getBackendType } from "./util.js"
import { GrowCloudBackend } from "./grow/backend-grow.js"
import { GardenCloudBackend } from "./legacy/backend-garden.js"
import type { GardenBackendConfig } from "./backend-base.js"

export function gardenBackendFactory(projectConfig: ProjectConfig, backendConfig: GardenBackendConfig) {
  const gardenBackendClass = getBackendType(projectConfig) === "v2" ? GrowCloudBackend : GardenCloudBackend
  return new gardenBackendClass(backendConfig)
}
