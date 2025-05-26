/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import yaml from "js-yaml"
import { makeTestGardenA, cleanProject, withDefaultGlobalOpts } from "../../../../helpers.js"
import {
  generateBasicDebugInfoReport,
  TEMP_DEBUG_ROOT,
  collectBasicDebugInfo,
  SYSTEM_INFO_FILENAME_NO_EXT,
  collectSystemDiagnostic,
  collectProviderDebugInfo,
  PROVIDER_INFO_FILENAME_NO_EXT,
  GetDebugInfoCommand,
} from "../../../../../src/commands/get/get-debug-info.js"
import fsExtra from "fs-extra"
const { readdir, remove, pathExists, readJSON, readFile } = fsExtra
import { ERROR_LOG_FILENAME } from "../../../../../src/constants.js"
import { join, relative, basename } from "path"
import type { Garden } from "../../../../../src/garden.js"
import type { Log } from "../../../../../src/logger/log-entry.js"
import { defaultConfigFilename } from "../../../../../src/util/fs.js"
import { makeTestGarden } from "../../../../helpers.js"
import { getDataDir } from "../../../../helpers.js"
import { defaultProjectConfigFilename } from "../../../../../src/commands/create/create-project.js"

const debugZipFileRegex = new RegExp(/debug-info-.*?.zip/)

async function cleanupTmpDebugFiles(root: string, gardenDirPath: string) {
  const allFiles = await readdir(root)
  await remove(join(gardenDirPath, TEMP_DEBUG_ROOT))
  const deleteFilenames = allFiles.filter((fileName) => {
    return fileName.match(debugZipFileRegex)
  })
  for await (const name of deleteFilenames) {
    await remove(join(root, name))
  }
}

describe("GetDebugInfoCommand", () => {
  let garden: Garden
  let log: Log
  let gardenDebugTmp: string

  before(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    gardenDebugTmp = join(garden.gardenDirPath, TEMP_DEBUG_ROOT)
  })

  afterEach(async () => {
    await cleanupTmpDebugFiles(garden.projectRoot, garden.gardenDirPath)
  })

  after(async () => {
    await cleanProject(garden.gardenDirPath)
  })

  describe("generateDebugInfoReport", () => {
    it("should generate a zip file containing a debug info report in the root folder of the project", async () => {
      const command = new GetDebugInfoCommand()
      const res = await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({ "format": "json", "include-project": false }),
      })

      expect(res.result).to.eql(0)

      const gardenProjectRootFiles = await readdir(garden.projectRoot)
      const zipFiles = gardenProjectRootFiles.filter((fileName) => {
        return fileName.match(debugZipFileRegex)
      })
      expect(zipFiles.length).to.equal(1)
    })
  })

  describe("generateBasicDebugInfoReport", () => {
    it("should generate a zip file with a *basic* debug info report in the root folder of the project", async () => {
      await generateBasicDebugInfoReport(garden.projectRoot, garden.gardenDirPath, log)
      const gardenProjectRootFiles = await readdir(garden.projectRoot)
      const zipFiles = gardenProjectRootFiles.filter((fileName) => {
        return fileName.match(debugZipFileRegex)
      })
      expect(zipFiles.length).to.equal(1)
    })
  })

  describe("collectBasicDebugInfo", () => {
    it("should create a basic debug info report in a temporary folder", async () => {
      await collectBasicDebugInfo(garden.projectRoot, garden.gardenDirPath, log)

      // we first check if the main garden.yml exists
      expect(await pathExists(join(gardenDebugTmp, defaultConfigFilename))).to.equal(true)
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })

      // Check that each module config files have been copied over and
      // the folder structure is maintained
      for (const module of graph.getModules()) {
        const moduleRelativePath = relative(garden.projectRoot, module.path)

        // Checks folder structure is maintained
        expect(await pathExists(join(gardenDebugTmp, moduleRelativePath))).to.equal(true)

        // Checks config file is copied over
        expect(await pathExists(join(gardenDebugTmp, moduleRelativePath, defaultConfigFilename))).to.equal(true)

        // Checks error logs are copied over if they exist
        if (await pathExists(join(module.path, ERROR_LOG_FILENAME))) {
          expect(await pathExists(join(gardenDebugTmp, moduleRelativePath, ERROR_LOG_FILENAME))).to.equal(true)
        }
      }
    })

    it("should correctly handle custom-named config files", async () => {
      const _garden = await makeTestGarden(getDataDir("test-projects", "custom-config-names"))
      const debugTmp = join(_garden.gardenDirPath, TEMP_DEBUG_ROOT)

      try {
        await collectBasicDebugInfo(_garden.projectRoot, _garden.gardenDirPath, log)

        // we first check if the project.garden.yml exists
        expect(await pathExists(join(debugTmp, defaultProjectConfigFilename))).to.equal(true)
        const graph = await _garden.getConfigGraph({ log: _garden.log, emit: false })

        // Check that each module config files have been copied over and
        // the folder structure is maintained
        for (const module of graph.getModules()) {
          const moduleRelativePath = relative(_garden.projectRoot, module.path)
          const configFilename = basename(module.configPath!)

          // Checks folder structure is maintained
          expect(await pathExists(join(debugTmp, moduleRelativePath))).to.equal(true)

          // Checks config file is copied over
          expect(await pathExists(join(debugTmp, moduleRelativePath, configFilename))).to.equal(true)

          // Checks error logs are copied over if they exist
          if (await pathExists(join(module.path, ERROR_LOG_FILENAME))) {
            expect(await pathExists(join(debugTmp, moduleRelativePath, ERROR_LOG_FILENAME))).to.equal(true)
          }
        }
      } finally {
        await cleanupTmpDebugFiles(_garden.projectRoot, _garden.gardenDirPath)
      }
    })
  })

  describe("collectSystemDiagnostic", () => {
    it("should create a system info report in a temporary folder", async () => {
      const format = "json"
      await collectSystemDiagnostic(garden.gardenDirPath, log, format)

      // Check if the temporary folder exists
      expect(await pathExists(gardenDebugTmp)).to.equal(true)

      // Checks if system debug file is created
      const systemInfoFilePath = join(gardenDebugTmp, `${SYSTEM_INFO_FILENAME_NO_EXT}.${format}`)
      expect(await pathExists(systemInfoFilePath)).to.equal(true)

      // Check structure of systemInfoFile
      const systemInfoFile = await readJSON(systemInfoFilePath)
      expect(systemInfoFile).to.have.property("gardenVersion")
      expect(systemInfoFile).to.have.property("platform")
      expect(systemInfoFile).to.have.property("platformVersion")
    })

    it("should create a system info report in a temporary folder with yaml format", async () => {
      const format = "yaml"
      await collectSystemDiagnostic(garden.gardenDirPath, log, format)

      // Check if the temporary folder exists
      expect(await pathExists(gardenDebugTmp)).to.equal(true)

      // Checks if system debug file is created
      const systemInfoFilePath = join(gardenDebugTmp, `${SYSTEM_INFO_FILENAME_NO_EXT}.${format}`)
      expect(await pathExists(systemInfoFilePath)).to.equal(true)

      // Check structure of systemInfoFile
      const systemInfoFile = yaml.load(await readFile(systemInfoFilePath, "utf8"))
      expect(systemInfoFile).to.have.property("gardenVersion")
      expect(systemInfoFile).to.have.property("platform")
      expect(systemInfoFile).to.have.property("platformVersion")
    })
  })

  describe("collectProviderDebugInfo", () => {
    it("should create a test-plugin json report in a temporary folder", async () => {
      const format = "json"
      const expectedProviderFolderName = "test-plugin"
      const providerInfoFilePath = join(expectedProviderFolderName, `${PROVIDER_INFO_FILENAME_NO_EXT}.${format}`)

      await collectProviderDebugInfo(garden, log, format, false)

      // Check if the temporary folder exists
      expect(await pathExists(gardenDebugTmp)).to.equal(true)

      // Check if the test-plugin folder exists
      expect(await pathExists(join(gardenDebugTmp, expectedProviderFolderName))).to.equal(true)

      // Check if the test-plugin folder exists
      expect(await pathExists(join(gardenDebugTmp, providerInfoFilePath))).to.equal(true)

      // Check structure of provider info file
      const systemInfoFile = await readJSON(join(gardenDebugTmp, providerInfoFilePath))
      expect(systemInfoFile).to.have.property("info")
    })
  })
})
