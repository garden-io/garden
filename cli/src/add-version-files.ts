/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GitHandler } from "@garden-io/core/build/src/vcs/git"
import { Garden } from "@garden-io/core/build/src/garden"
import { Logger } from "@garden-io/core/build/src/logger/logger"
import { LogLevel } from "@garden-io/core/build/src/logger/log-node"
import { resolve, relative } from "path"
import Bluebird from "bluebird"
import { STATIC_DIR, GARDEN_VERSIONFILE_NAME } from "@garden-io/core/build/src/constants"
import { writeTreeVersionFile } from "@garden-io/core/build/src/vcs/vcs"

require("source-map-support").install()

// make sure logger is initialized
try {
  Logger.initialize({ level: LogLevel.info })
} catch (_) {}

/**
 * Write .garden-version files for modules in garden-system/static.
 */
async function addVersionFiles() {
  const garden = await Garden.factory(STATIC_DIR)

  const moduleConfigs = await garden.getRawModuleConfigs()

  return Bluebird.map(moduleConfigs, async (config) => {
    const path = config.path
    const versionFilePath = resolve(path, GARDEN_VERSIONFILE_NAME)

    const vcsHandler = new GitHandler(garden.gardenDirPath, garden.dotIgnoreFiles)
    const treeVersion = await vcsHandler.getTreeVersion(garden.log, garden.projectName, config)

    // tslint:disable-next-line: no-console
    console.log(`${config.name} -> ${relative(STATIC_DIR, versionFilePath)}`)

    return writeTreeVersionFile(path, treeVersion)
  })
}

addVersionFiles().catch((err) => {
  // tslint:disable-next-line: no-console
  console.error(err)
  process.exit(1)
})
