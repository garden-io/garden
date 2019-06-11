/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GitHandler } from "../vcs/git"
import { Garden } from "../garden"
import { Logger } from "../logger/logger"
import { LogLevel } from "../logger/log-node"
import { resolve, relative } from "path"
import * as Bluebird from "bluebird"
import { writeFile } from "fs-extra"
import { STATIC_DIR } from "../constants"

// make sure logger is initialized
try {
  Logger.initialize({ level: LogLevel.info })
} catch (_) { }

/**
 * Write .garden-version files for modules in garden-system/static.
 */
async function addVersionFiles() {
  const garden = await Garden.factory(STATIC_DIR)

  const moduleConfigs = await garden.getRawModuleConfigs()

  return Bluebird.map(moduleConfigs, async (config) => {
    const path = config.path
    const versionFilePath = resolve(path, ".garden-version")

    const vcsHandler = new GitHandler(garden.gardenDirPath)
    const treeVersion = await vcsHandler.getTreeVersion(path, config.include || null)

    console.log(`${config.name} -> ${relative(STATIC_DIR, versionFilePath)}`)

    return writeFile(versionFilePath, JSON.stringify(treeVersion, null, 4) + "\n")
  })
}

addVersionFiles()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
