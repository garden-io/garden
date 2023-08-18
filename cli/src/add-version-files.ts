/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GitHandler } from "@garden-io/core/build/src/vcs/git"
import { Garden } from "@garden-io/core/build/src/garden"
import { LogLevel, RootLogger } from "@garden-io/core/build/src/logger/logger"
import { resolve, relative } from "path"
import { STATIC_DIR, GARDEN_VERSIONFILE_NAME } from "@garden-io/core/build/src/constants"
import { writeTreeVersionFile } from "@garden-io/core/build/src/vcs/vcs"
import { TreeCache } from "@garden-io/core/build/src/cache"

require("source-map-support").install()

// make sure logger is initialized
RootLogger.initialize({ level: LogLevel.info, displayWriterType: "quiet", storeEntries: false })

/**
 * Write .garden-version files for modules in garden-system/static.
 */
async function addVersionFiles() {
  const garden = await Garden.factory(STATIC_DIR, { commandInfo: { name: "add-version-files", args: {}, opts: {} } })

  const moduleConfigs = await garden.getRawModuleConfigs()

  return Promise.all(
    moduleConfigs.map(async (config) => {
      const path = config.path
      const versionFilePath = resolve(path, GARDEN_VERSIONFILE_NAME)

      const vcsHandler = new GitHandler({
        garden,
        projectRoot: STATIC_DIR,
        gardenDirPath: garden.gardenDirPath,
        ignoreFile: garden.dotIgnoreFile,
        cache: new TreeCache(),
      })
      const treeVersion = await vcsHandler.getTreeVersion({ log: garden.log, projectName: garden.projectName, config })

      // eslint-disable-next-line no-console
      console.log(`${config.name} -> ${relative(STATIC_DIR, versionFilePath)}`)

      return writeTreeVersionFile(path, treeVersion)
    })
  )
}

if (require.main === module) {
  addVersionFiles().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err)
    process.exit(1)
  })
}
