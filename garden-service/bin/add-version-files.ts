#!/usr/bin/env ts-node

import { GitHandler } from "../src/vcs/git"
import { Garden } from "../src/garden"
import { Logger } from "../src/logger/logger"
import { LogLevel } from "../src/logger/log-node"
import { resolve } from "path"
import * as Bluebird from "bluebird"
import { writeFile } from "fs-extra"

// make sure logger is initialized
try {
  Logger.initialize({ level: LogLevel.info })
} catch (_) { }

async function addVersionFiles() {
  const staticPath = resolve(__dirname, "..", "static")
  const garden = await Garden.factory(staticPath)

  const graph = await garden.getConfigGraph()
  const modules = await graph.getModules()

  return Bluebird.map(modules, async (module) => {
    const path = module.path
    const versionFilePath = resolve(path, ".garden-version")

    const vcsHandler = new GitHandler(path)
    const treeVersion = await vcsHandler.getTreeVersion(path)

    return writeFile(versionFilePath, JSON.stringify(treeVersion, null, 4) + "\n")
  })
}

addVersionFiles()
  .catch(err => { throw err })
