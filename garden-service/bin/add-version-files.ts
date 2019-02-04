#!/usr/bin/env ts-node

import { GitHandler } from "../src/vcs/git"
import { Garden } from "../src/garden"
import { Logger } from "../src/logger/logger"
import { LogLevel } from "../src/logger/log-node"
import { resolve, relative } from "path"
import * as Bluebird from "bluebird"
import { writeFile } from "fs-extra"

// make sure logger is initialized
try {
  Logger.initialize({ level: LogLevel.info })
} catch (_) { }

async function addVersionFiles() {
  const staticPath = resolve(__dirname, "..", "static")
  const garden = await Garden.factory(staticPath)

  const moduleConfigs = await garden.getRawModuleConfigs()

  return Bluebird.map(moduleConfigs, async (config) => {
    const path = config.path
    const versionFilePath = resolve(path, ".garden-version")

    const vcsHandler = new GitHandler(path)
    const treeVersion = await vcsHandler.getTreeVersion(path)

    console.log(`${config.name} -> ${relative(staticPath, versionFilePath)}`)

    return writeFile(versionFilePath, JSON.stringify(treeVersion, null, 4) + "\n")
  })
}

addVersionFiles()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
