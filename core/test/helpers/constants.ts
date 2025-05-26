/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { GARDEN_CORE_ROOT } from "../../src/constants.js"
import { hashRepoUrl } from "../../src/util/ext-source-util.js"
import type { ModuleVersion } from "../../src/vcs/vcs.js"

export const testDataDir = resolve(GARDEN_CORE_ROOT, "test", "data")
export const testNow = new Date()
export const testModuleVersionString = "v-1234512345"
export const testModuleVersion: ModuleVersion = {
  contentHash: testModuleVersionString,
  versionString: testModuleVersionString,
  dependencyVersions: {},
  files: [],
}

// All test projects use this git URL
export const testGitUrl = "https://example.com/my-repo.git#main"
export const testGitUrlHash = hashRepoUrl(testGitUrl)
